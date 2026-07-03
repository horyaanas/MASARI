'use client';

import React from 'react';
import { useAppStore, themeColorMap } from '@/lib/store';
import { t } from '@/lib/i18n';
import { deleteCourse, getAllProgress } from '@/lib/db-indexeddb';
import { Trash2, BookOpen, Layers, Calendar, ChevronLeft, ChevronRight, GraduationCap } from 'lucide-react';

export function CoursesList() {
  const { courses, progressMap, language, selectCourse, deleteConfirmId, setDeleteConfirmId, themeColor, removeCourseFromList, setProgress, setImportModalOpen, setYouTubeImportOpen } = useAppStore();
  const lang = language;
  const isRTL = lang === 'ar';
  const tc = themeColorMap[themeColor];
  const ArrowIcon = isRTL ? ChevronLeft : ChevronRight;

  const handleDelete = async (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteConfirmId === courseId) {
      await deleteCourse(courseId);
      removeCourseFromList(courseId);
      const progress = await getAllProgress();
      setProgress(progress);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(courseId);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  if (courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: `${tc.primary}10` }}
        >
          <GraduationCap className="w-10 h-10" style={{ color: tc.primary }} />
        </div>
        <p className="font-medium text-foreground mb-1">{t('noCourses', lang)}</p>
        <p className="text-xs text-muted-foreground mb-4">{t('addFirstCourse', lang)}</p>
        <div className="flex gap-3">
          <button
            onClick={() => setImportModalOpen(true)}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-transform active:scale-95 shadow-md"
            style={{ backgroundColor: tc.primary }}
          >
            {t('fromExcel', lang)}
          </button>
          <button
            onClick={() => setYouTubeImportOpen(true)}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-transform active:scale-95 shadow-md bg-red-500 hover:bg-red-600"
          >
            {t('fromYouTube', lang)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('coursesTitle', lang)}</h1>
        <button
          onClick={() => setImportModalOpen(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-transform active:scale-90 shadow-sm"
          style={{ backgroundColor: tc.primary }}
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-3">
        {courses.map((course) => {
          const progress = progressMap[course.id];
          const percentage = progress?.percentage || 0;
          const isCompleted = percentage === 100;
          const totalLessons = course.levels.reduce((s, l) => s + l.lessons.length, 0);
          const completedLessonCount = course.levels.reduce((s, l) => s + l.lessons.filter(ls => ls.completed).length, 0);

          return (
            <div
              key={course.id}
              className="rounded-2xl border bg-card shadow-sm overflow-hidden cursor-pointer transition-all hover:shadow-md active:scale-[0.98]"
              onClick={() => selectCourse(course.id)}
            >
              {/* Gradient top bar */}
              <div
                className="h-1.5"
                style={{
                  background: isCompleted
                    ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                    : `linear-gradient(90deg, ${tc.primaryDark}, ${tc.primary})`,
                }}
              />

              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base truncate">{course.name}</h3>
                    <div className="flex items-center flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" />
                        {course.levels.length} {t('levels', lang)}
                      </span>
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        {completedLessonCount}/{totalLessons}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(course.createdAt).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    {course.type && (
                      <span
                        className="inline-block text-[10px] px-2.5 py-0.5 rounded-full text-white mt-2 font-medium"
                        style={{ backgroundColor: tc.primary }}
                      >
                        {course.type}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(course.id, e)}
                      className={`p-2 rounded-lg transition-all ${
                        deleteConfirmId === course.id
                          ? 'bg-destructive text-destructive-foreground scale-110'
                          : 'hover:bg-destructive/10 text-muted-foreground'
                      }`}
                      title={deleteConfirmId === course.id ? (lang === 'ar' ? 'اضغط للتأكيد' : 'Tap to confirm') : t('deleteCourse', lang)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Arrow */}
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${tc.primary}10` }}
                    >
                      <ArrowIcon className="w-4 h-4" style={{ color: tc.primary }} />
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">{t('progress', lang)}</span>
                    <span
                      className="font-bold"
                      style={{ color: isCompleted ? '#22c55e' : tc.primary }}
                    >
                      {percentage}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${percentage}%`,
                        background: isCompleted
                          ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                          : `linear-gradient(90deg, ${tc.primaryDark}, ${tc.primary})`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Plus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
