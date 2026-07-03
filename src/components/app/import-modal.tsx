'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useAppStore, themeColorMap } from '@/lib/store';
import { t } from '@/lib/i18n';
import { parseExcelFile, autoDetectColumns, buildCourseFromData, ExcelSheet, ColumnMapping } from '@/lib/excel';
import { getAllProgress, updateCourse, saveCourse } from '@/lib/db-indexeddb';
import { X, FileSpreadsheet, CheckCircle, AlertCircle, Upload, ChevronRight, ChevronLeft, FileCheck, Columns3, Eye, Layers, BookOpen } from 'lucide-react';

type ImportStep = 'file' | 'sheets-mapping' | 'course-assignment' | 'preview';

const stepLabels = {
  file: 'selectFile',
  'sheets-mapping': 'selectSheets',
  'course-assignment': 'courseName',
  preview: 'preview',
} as const;

interface SheetConfig {
  selected: boolean;
  mapping: ColumnMapping;
}

export function ImportModal() {
  const { isImportModalOpen, setImportModalOpen, language, themeColor, courses } = useAppStore();
  const lang = language;
  const isRTL = lang === 'ar';
  const tc = themeColorMap[themeColor];

  const [step, setStep] = useState<ImportStep>('file');
  const [sheets, setSheets] = useState<ExcelSheet[]>([]);
  const [sheetConfigs, setSheetConfigs] = useState<Record<number, SheetConfig>>({});
  const [courseName, setCourseName] = useState('');
  const [courseType, setCourseType] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<'new' | 'existing' | 'levels'>('new');
  const [selectedExistingCourseId, setSelectedExistingCourseId] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('file');
    setSheets([]);
    setSheetConfigs({});
    setCourseName('');
    setCourseType('');
    setAssignmentMode('new');
    setSelectedExistingCourseId('');
    setImportSuccess(false);
    setImportError('');
    setIsImporting(false);
  }, []);

  const handleClose = useCallback(() => {
    setImportModalOpen(false);
    reset();
  }, [setImportModalOpen, reset]);

  const handleFile = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseExcelFile(buffer);
      if (parsed.length === 0) {
        setImportError(t('noData', lang));
        return;
      }
      setSheets(parsed);
      setCourseName(file.name.replace(/\.(xlsx|xls|csv)$/i, ''));

      // Auto-detect columns for all sheets
      const configs: Record<number, SheetConfig> = {};
      parsed.forEach((sheet, i) => {
        const autoMapping = autoDetectColumns(sheet.columns);
        configs[i] = {
          selected: true,
          mapping: {
            courseType: autoMapping.courseType || '',
            level: autoMapping.level || '',
            lessonName: autoMapping.lessonName || '',
            lessonUrl: autoMapping.lessonUrl || '',
            duration: autoMapping.duration || '',
          },
        };
      });
      setSheetConfigs(configs);
      setStep('sheets-mapping');
      setImportError('');
    } catch {
      setImportError(t('invalidFile', lang));
    }
  }, [lang]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const toggleSheet = (index: number) => {
    setSheetConfigs((prev) => ({
      ...prev,
      [index]: { ...prev[index], selected: !prev[index].selected },
    }));
  };

  const toggleAllSheets = () => {
    const allSelected = Object.values(sheetConfigs).every((c) => c.selected);
    setSheetConfigs((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((k) => {
        updated[Number(k)] = { ...updated[Number(k)], selected: !allSelected };
      });
      return updated;
    });
  };

  const updateSheetMapping = (index: number, field: keyof ColumnMapping, value: string) => {
    setSheetConfigs((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        mapping: { ...prev[index].mapping, [field]: value },
      },
    }));
  };

  const autoDetectSheet = (index: number) => {
    const sheet = sheets[index];
    if (!sheet) return;
    const autoMapping = autoDetectColumns(sheet.columns);
    setSheetConfigs((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        mapping: {
          courseType: autoMapping.courseType || '',
          level: autoMapping.level || '',
          lessonName: autoMapping.lessonName || '',
          lessonUrl: autoMapping.lessonUrl || '',
          duration: autoMapping.duration || '',
        },
      },
    }));
  };

  const selectedSheets = sheets.filter((_, i) => sheetConfigs[i]?.selected);
  const hasValidMapping = selectedSheets.length > 0 && selectedSheets.every((sheet, i) => {
    const config = sheetConfigs[sheets.indexOf(sheet)];
    return config?.mapping.level && config?.mapping.lessonName;
  });

  const handleImport = useCallback(async () => {
    if (isImporting) return;
    setIsImporting(true);

    try {
      if (assignmentMode === 'new') {
        // Create new course from selected sheets
        for (const sheet of selectedSheets) {
          const config = sheetConfigs[sheets.indexOf(sheet)];
          if (!config) continue;
          const course = buildCourseFromData(courseName, courseType, sheet.data, config.mapping);
          await saveCourse(course);
          useAppStore.getState().addCourseToList(course);
        }
      } else if (assignmentMode === 'existing') {
        // Add to existing course
        const existingCourse = courses.find((c) => c.id === selectedExistingCourseId);
        if (!existingCourse) throw new Error('Course not found');
        const updatedLevels = [...existingCourse.levels];
        for (const sheet of selectedSheets) {
          const config = sheetConfigs[sheets.indexOf(sheet)];
          if (!config) continue;
          const tempCourse = buildCourseFromData(courseName, courseType, sheet.data, config.mapping);
          updatedLevels.push(...tempCourse.levels);
        }
        // Re-assign IDs and order
        updatedLevels.forEach((l, i) => {
          l.courseId = existingCourse.id;
          l.order = i;
          l.lessons.forEach((ls) => { ls.courseId = existingCourse.id; });
        });
        const updated = { ...existingCourse, levels: updatedLevels, updatedAt: Date.now() };
        await updateCourse(updated);
        useAppStore.getState().updateCourseInList(updated);
      } else if (assignmentMode === 'levels') {
        // Add as new levels in existing course
        const existingCourse = courses.find((c) => c.id === selectedExistingCourseId);
        if (!existingCourse) throw new Error('Course not found');
        const updatedLevels = [...existingCourse.levels];
        for (const sheet of selectedSheets) {
          const config = sheetConfigs[sheets.indexOf(sheet)];
          if (!config) continue;
          const tempCourse = buildCourseFromData(courseName, courseType, sheet.data, config.mapping);
          updatedLevels.push(...tempCourse.levels);
        }
        updatedLevels.forEach((l, i) => {
          l.courseId = existingCourse.id;
          l.order = i;
          l.lessons.forEach((ls) => { ls.courseId = existingCourse.id; });
        });
        const updated = { ...existingCourse, levels: updatedLevels, updatedAt: Date.now() };
        await updateCourse(updated);
        useAppStore.getState().updateCourseInList(updated);
      }

      const progress = await getAllProgress();
      useAppStore.getState().setProgress(progress);

      setImportSuccess(true);
      setTimeout(handleClose, 1500);
    } catch {
      setImportError(t('importError', lang));
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, assignmentMode, selectedSheets, sheets, sheetConfigs, courseName, courseType, courses, selectedExistingCourseId, lang, handleClose]);

  if (!isImportModalOpen) return null;

  const steps: { key: ImportStep; label: string }[] = [
    { key: 'file', label: t('selectFile', lang) },
    { key: 'sheets-mapping', label: t('selectSheets', lang) },
    { key: 'course-assignment', label: t('courseName', lang) },
    { key: 'preview', label: t('preview', lang) },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);
  const NextArrow = isRTL ? ChevronLeft : ChevronRight;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-lg bg-background rounded-t-3xl sm:rounded-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-fade-in">
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ background: `linear-gradient(135deg, ${tc.primaryDark}10, ${tc.primary}10)` }}
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet style={{ color: tc.primary }} className="w-5 h-5" />
            <h2 className="text-base font-bold">{t('importTitle', lang)}</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps Indicator */}
        <div className="flex items-center px-4 py-3 border-b gap-1">
          {steps.map((s, i) => (
            <React.Fragment key={s.key}>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                  style={{
                    backgroundColor: i <= currentStepIndex ? tc.primary : 'var(--muted)',
                    color: i <= currentStepIndex ? 'white' : 'var(--muted-foreground)',
                  }}
                >
                  {i < currentStepIndex ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-[10px] whitespace-nowrap hidden sm:block ${i <= currentStepIndex ? 'font-medium' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className="flex-1 h-0.5 rounded-full mx-1"
                  style={{ backgroundColor: i < currentStepIndex ? tc.primary : 'var(--muted)' }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {importError && (
            <div className="mb-4 p-3 rounded-xl bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {importError}
            </div>
          )}

          {importSuccess && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${tc.primary}15` }}>
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
              <p className="font-bold text-lg text-green-600">{t('importSuccess', lang)}</p>
            </div>
          )}

          {isImporting && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-4 rounded-full animate-spin mb-4" style={{ borderColor: `${tc.primary}30`, borderTopColor: tc.primary }} />
              <p className="text-sm text-muted-foreground font-medium">{t('importing', lang)}</p>
            </div>
          )}

          {/* STEP 1: File Upload */}
          {!importSuccess && !isImporting && step === 'file' && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${isDragging ? 'scale-[1.02]' : ''}`}
                style={{
                  borderColor: isDragging ? tc.primary : 'var(--border)',
                  backgroundColor: isDragging ? `${tc.primary}08` : 'transparent',
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `${tc.primary}10` }}>
                  <Upload className="w-8 h-8" style={{ color: tc.primary }} />
                </div>
                <p className="text-sm font-medium mb-1">{t('dragDrop', lang)}</p>
                <p className="text-xs text-muted-foreground mb-3">{t('or', lang)}</p>
                <span className="inline-block px-5 py-2 rounded-xl text-white text-sm font-medium" style={{ backgroundColor: tc.primary }}>
                  {t('browseFile', lang)}
                </span>
                <p className="text-[10px] text-muted-foreground mt-3">.xlsx, .xls, .csv</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleInputChange} />
              </div>
            </div>
          )}

          {/* STEP 2: Sheet & Column Selection */}
          {!importSuccess && !isImporting && step === 'sheets-mapping' && (
            <div className="space-y-4">
              {/* Select All toggle */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">{t('selectSheets', lang)}</h3>
                <button
                  onClick={toggleAllSheets}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors"
                  style={{ color: tc.primary, borderColor: `${tc.primary}30` }}
                >
                  {t('selectAll', lang)}
                </button>
              </div>

              {sheets.map((sheet, i) => {
                const config = sheetConfigs[i];
                if (!config) return null;

                return (
                  <div
                    key={sheet.name}
                    className={`rounded-xl border overflow-hidden transition-all ${
                      config.selected ? 'shadow-sm' : 'opacity-50'
                    }`}
                    style={config.selected ? { borderColor: `${tc.primary}40` } : {}}
                  >
                    {/* Sheet header with checkbox */}
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => toggleSheet(i)}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: config.selected ? tc.primary : 'var(--muted-foreground)',
                            backgroundColor: config.selected ? tc.primary : 'transparent',
                          }}
                        >
                          {config.selected && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{sheet.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {sheet.data.length} {t('recordsCount', lang)} • {sheet.columns.length} {lang === 'ar' ? 'أعمدة' : 'columns'}
                          </p>
                        </div>
                      </div>
                      <FileCheck className="w-4 h-4 text-muted-foreground" />
                    </div>

                    {/* Column mapping (only for selected sheets) */}
                    {config.selected && (
                      <div className="px-3 pb-3 pt-1 border-t space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-medium text-muted-foreground">{t('columnMapping', lang)}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); autoDetectSheet(i); }}
                            className="text-[10px] font-medium px-2 py-1 rounded-md hover:bg-accent transition-colors"
                            style={{ color: tc.primary }}
                          >
                            {t('autoDetect', lang)}
                          </button>
                        </div>

                        <ColumnSelectCompact
                          label={t('levelLabel', lang)}
                          value={config.mapping.level}
                          columns={sheet.columns}
                          onChange={(v) => updateSheetMapping(i, 'level', v)}
                          required
                          primaryColor={tc.primary}
                          lang={lang}
                        />
                        <ColumnSelectCompact
                          label={t('lessonName', lang)}
                          value={config.mapping.lessonName}
                          columns={sheet.columns}
                          onChange={(v) => updateSheetMapping(i, 'lessonName', v)}
                          required
                          primaryColor={tc.primary}
                          lang={lang}
                        />
                        <ColumnSelectCompact
                          label={t('lessonUrl', lang)}
                          value={config.mapping.lessonUrl}
                          columns={sheet.columns}
                          onChange={(v) => updateSheetMapping(i, 'lessonUrl', v)}
                          primaryColor={tc.primary}
                          lang={lang}
                        />
                        <ColumnSelectCompact
                          label={t('durationLabel', lang)}
                          value={config.mapping.duration}
                          columns={sheet.columns}
                          onChange={(v) => updateSheetMapping(i, 'duration', v)}
                          primaryColor={tc.primary}
                          lang={lang}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* STEP 3: Course Assignment */}
          {!importSuccess && !isImporting && step === 'course-assignment' && (
            <div className="space-y-4">
              {/* Assignment mode selection */}
              <div className="space-y-2">
                {[
                  { mode: 'new' as const, icon: <BookOpen className="w-4 h-4" />, label: t('createNewCourse', lang) },
                  { mode: 'existing' as const, icon: <Layers className="w-4 h-4" />, label: t('addAsNewLevels', lang) },
                ].map((opt) => (
                  <button
                    key={opt.mode}
                    onClick={() => setAssignmentMode(opt.mode)}
                    className={`w-full p-3 rounded-xl border text-sm text-start transition-all flex items-center gap-3 ${
                      assignmentMode === opt.mode ? 'shadow-md' : 'hover:bg-accent'
                    }`}
                    style={assignmentMode === opt.mode ? { borderColor: tc.primary, backgroundColor: `${tc.primary}08` } : {}}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: assignmentMode === opt.mode ? tc.primary : 'var(--muted)', color: assignmentMode === opt.mode ? 'white' : 'var(--muted-foreground)' }}
                    >
                      {opt.icon}
                    </div>
                    <span className="font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>

              {/* New course fields */}
              {assignmentMode === 'new' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">{t('courseName', lang)} *</label>
                    <input
                      type="text"
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      className="w-full h-11 rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': tc.primary } as React.CSSProperties}
                      placeholder={lang === 'ar' ? 'أدخل اسم الدورة' : 'Enter course name'}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">{t('courseTypeLabel', lang)}</label>
                    <input
                      type="text"
                      value={courseType}
                      onChange={(e) => setCourseType(e.target.value)}
                      className="w-full h-11 rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': tc.primary } as React.CSSProperties}
                      placeholder={lang === 'ar' ? 'مثال: برمجة، تصميم...' : 'e.g., Programming, Design...'}
                    />
                  </div>
                </div>
              )}

              {/* Existing course selection */}
              {assignmentMode === 'existing' && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{lang === 'ar' ? 'اختر الدورة' : 'Select Course'}</label>
                  {courses.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">{t('noCourses', lang)}</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {courses.map((course) => (
                        <button
                          key={course.id}
                          onClick={() => setSelectedExistingCourseId(course.id)}
                          className={`w-full p-3 rounded-xl border text-sm text-start transition-all ${
                            selectedExistingCourseId === course.id ? 'shadow-md' : 'hover:bg-accent'
                          }`}
                          style={selectedExistingCourseId === course.id ? { borderColor: tc.primary, backgroundColor: `${tc.primary}08` } : {}}
                        >
                          <p className="font-medium">{course.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {course.levels.length} {t('levels', lang)} • {course.type || (lang === 'ar' ? 'بدون تصنيف' : 'No type')}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Preview of data organization */}
              <div className="p-3 rounded-xl border text-xs" style={{ backgroundColor: `${tc.primary}08`, borderColor: `${tc.primary}30` }}>
                <p className="font-medium" style={{ color: tc.primary }}>
                  {lang === 'ar' ? 'ملخص الاستيراد' : 'Import Summary'}
                </p>
                <p className="text-muted-foreground mt-1">
                  {selectedSheets.length} {lang === 'ar' ? 'أوراق مختارة' : 'sheets selected'} • {selectedSheets.reduce((s, sh) => s + sh.data.length, 0)} {t('recordsCount', lang)}
                </p>
              </div>
            </div>
          )}

          {/* STEP 4: Preview & Import */}
          {!importSuccess && !isImporting && step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{t('preview', lang)}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: tc.primary }}>
                  {selectedSheets.reduce((s, sh) => s + sh.data.length, 0)} {t('recordsCount', lang)}
                </span>
              </div>

              {selectedSheets.map((sheet, si) => {
                const sheetIndex = sheets.indexOf(sheet);
                const config = sheetConfigs[sheetIndex];
                if (!config) return null;
                const previewData = sheet.data.slice(0, 5);

                return (
                  <div key={sheet.name} className="space-y-2">
                    <p className="text-xs font-medium flex items-center gap-1">
                      <FileCheck className="w-3 h-3" style={{ color: tc.primary }} />
                      {sheet.name}
                    </p>
                    <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ backgroundColor: `${tc.primary}10` }}>
                            <th className="p-2 text-start font-medium">{t('levelLabel', lang)}</th>
                            <th className="p-2 text-start font-medium">{t('lessonName', lang)}</th>
                            <th className="p-2 text-start font-medium">{t('durationLabel', lang)}</th>
                            <th className="p-2 text-start font-medium">{t('lessonUrl', lang)}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.map((row, i) => (
                            <tr key={i} className="border-t hover:bg-accent/30 transition-colors">
                              <td className="p-2">{String(row[config.mapping.level] || '-')}</td>
                              <td className="p-2 font-medium">{String(row[config.mapping.lessonName] || '-')}</td>
                              <td className="p-2 text-muted-foreground">{String(row[config.mapping.duration] || '-')}</td>
                              <td className="p-2 max-w-[80px] truncate text-muted-foreground">{String(row[config.mapping.lessonUrl] || '-')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {lang === 'ar'
                        ? `عرض أول 5 سجلات من أصل ${sheet.data.length}`
                        : `Showing first 5 of ${sheet.data.length} records`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!importSuccess && !isImporting && (
          <div className="p-4 border-t flex items-center justify-between gap-3 bg-background">
            {step !== 'file' ? (
              <button
                onClick={() => {
                  const prevSteps: Record<ImportStep, ImportStep> = {
                    file: 'file',
                    'sheets-mapping': 'file',
                    'course-assignment': 'sheets-mapping',
                    preview: 'course-assignment',
                  };
                  setStep(prevSteps[step]);
                }}
                className="px-5 py-2.5 rounded-xl text-sm border hover:bg-accent transition-colors"
              >
                {t('back', lang)}
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={() => {
                if (step === 'file') return;
                if (step === 'sheets-mapping') {
                  if (!hasValidMapping) return;
                  setStep('course-assignment');
                } else if (step === 'course-assignment') {
                  if (assignmentMode === 'new' && !courseName.trim()) return;
                  if (assignmentMode === 'existing' && !selectedExistingCourseId) return;
                  setStep('preview');
                } else if (step === 'preview') {
                  handleImport();
                }
              }}
              disabled={
                step === 'file' ||
                (step === 'sheets-mapping' && !hasValidMapping) ||
                (step === 'course-assignment' && ((assignmentMode === 'new' && !courseName.trim()) || (assignmentMode === 'existing' && !selectedExistingCourseId)))
              }
              className="px-6 py-2.5 rounded-xl text-white text-sm font-medium transition-all active:scale-95 disabled:opacity-40 shadow-md flex items-center gap-1.5"
              style={{ backgroundColor: tc.primary }}
            >
              {step === 'preview' ? t('import', lang) : lang === 'ar' ? 'التالي' : 'Next'}
              {step !== 'preview' && <NextArrow className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ColumnSelectCompact({
  label,
  value,
  columns,
  onChange,
  required,
  primaryColor,
  lang,
}: {
  label: string;
  value: string;
  columns: string[];
  onChange: (v: string) => void;
  required?: boolean;
  primaryColor: string;
  lang: 'ar' | 'en';
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] min-w-[60px] text-muted-foreground flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-8 rounded-lg border bg-background px-2 text-xs focus:outline-none focus:ring-1"
        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
      >
        <option value="">
          -- {required ? t('required', lang) : t('optional', lang)} --
        </option>
        {columns.map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
    </div>
  );
}
