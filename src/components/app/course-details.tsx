'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useAppStore, themeColorMap } from '@/lib/store';
import { t } from '@/lib/i18n';
import { isLevelUnlocked, isLessonUnlocked, getLevelProgress, Lesson, Level, toggleLessonComplete, getAllProgress, updateCourse } from '@/lib/db-indexeddb';
import { ArrowRight, ArrowLeft, Lock, CheckCircle2, Clock, BookOpen, Trophy, Pencil, Trash2, X, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { CourseVideoToolbar } from './course-video-toolbar';
import { getCourseLessons } from '@/lib/course-video-utils';

// ============ COURSE DETAILS VIEW (shows level cards) ============
export function CourseDetails() {
  const { courses, selectedCourseId, language, goBack, themeColor, selectLevel, deleteConfirmId, setDeleteConfirmId } = useAppStore();
  const lang = language;
  const isRTL = lang === 'ar';
  const tc = themeColorMap[themeColor];
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;
  const LevelArrow = isRTL ? ChevronLeft : ChevronRight;

  const course = courses.find((c) => c.id === selectedCourseId);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState(false);

  // Track lessons that match the current filter (for hiding non-matching levels)
  const [matchingLessonIds, setMatchingLessonIds] = useState<Set<string>>(new Set());
  const [hideNonMatching, setHideNonMatching] = useState(false);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);

  const allCourseLessons = useMemo(() => (course ? getCourseLessons(course) : []), [course]);

  const handleFilteredLessonsChange = useCallback((info: { filtered: Lesson[]; hideNonMatching: boolean; hasActiveFilters: boolean }) => {
    setMatchingLessonIds(new Set(info.filtered.map((l) => l.id)));
    setHideNonMatching(info.hideNonMatching);
    setHasActiveFilters(info.hasActiveFilters);
  }, []);

  const handleEdit = () => {
    if (!course) return;
    setEditName(course.name);
    setEditType(course.type);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!course) return;
    const updated = { ...course, name: editName, type: editType, updatedAt: Date.now() };
    await updateCourse(updated);
    useAppStore.getState().updateCourseInList(updated);
    const progress = await getAllProgress();
    useAppStore.getState().setProgress(progress);
    setEditModalOpen(false);
  };

  const handleDeleteCourse = async () => {
    if (!course) return;
    if (!confirmDeleteCourse) {
      setConfirmDeleteCourse(true);
      setTimeout(() => setConfirmDeleteCourse(false), 3000);
      return;
    }
    const { deleteCourse } = await import('@/lib/db-indexeddb');
    await deleteCourse(course.id);
    useAppStore.getState().removeCourseFromList(course.id);
    goBack();
  };

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: `${tc.primary}10` }}>
          <BookOpen className="w-8 h-8" style={{ color: tc.primary }} />
        </div>
        <p className="text-muted-foreground">{t('noCourses', lang)}</p>
      </div>
    );
  }

  const totalLessons = course.levels.reduce((sum, l) => sum + l.lessons.length, 0);
  const completedLessons = course.levels.reduce((sum, l) => sum + l.lessons.filter((ls) => ls.completed).length, 0);
  const overallPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const isCompleted = overallPercentage === 100;

  return (
    <div className="pb-4">
      {/* Header */}
      <div
        className="p-4 pb-5"
        style={{
          background: isCompleted
            ? `linear-gradient(135deg, #059669, #22c55e)`
            : `linear-gradient(135deg, ${tc.primaryDark}, ${tc.primary})`,
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={goBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/20 text-white hover:bg-white/30 transition-colors"
          >
            <BackArrow className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white truncate flex-1">{course.name}</h1>
          <button
            onClick={handleEdit}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/20 text-white hover:bg-white/30 transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={handleDeleteCourse}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              confirmDeleteCourse ? 'bg-red-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-3">
          {course.type && (
            <span className="text-xs px-3 py-1 rounded-full bg-white/20 text-white font-medium">
              {course.type}
            </span>
          )}
          <span className="text-xs text-white/80 flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            {completedLessons}/{totalLessons} {t('lesson', lang)}
          </span>
        </div>

        <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-white transition-all duration-700 ease-out"
            style={{ width: `${overallPercentage}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-white/80">
            {isCompleted ? (lang === 'ar' ? 'أكملت الدورة! 🎉' : 'Course completed! 🎉') : `${overallPercentage}% ${t('completion', lang)}`}
          </p>
          {isCompleted && <Trophy className="w-4 h-4 text-yellow-300" />}
        </div>
      </div>

      {/* Level Cards */}
      <div className="p-4 space-y-3">
        {/* Video Tools Toolbar (filter / export / play) — placed next to course title */}
        {allCourseLessons.length > 0 && (
          <div className="rounded-2xl border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4" style={{ color: tc.primary }} />
              <h3 className="text-sm font-bold" style={{ color: tc.primary }}>
                {t('courseVideoTools', lang)}
              </h3>
              <span className="text-[10px] text-muted-foreground">
                {allCourseLessons.length} {t('lesson', lang)}
              </span>
            </div>
            <CourseVideoToolbar
              lessons={allCourseLessons}
              course={course}
              onFilteredLessonsChange={handleFilteredLessonsChange}
              compact
            />
          </div>
        )}

        <h2 className="text-base font-bold flex items-center gap-2">
          <Layers className="w-4 h-4" style={{ color: tc.primary }} />
          {t('levels', lang)}
        </h2>

        {course.levels.map((level) => {
          const unlocked = isLevelUnlocked(course, level.order);
          const lp = getLevelProgress(level);

          // When filter is active and hideNonMatching is on, hide levels
          // that contain zero matching lessons.
          const matchingInLevel = level.lessons.filter((l) => matchingLessonIds.has(l.id)).length;
          const shouldHide = hideNonMatching && hasActiveFilters && matchingInLevel === 0;
          if (shouldHide) return null;

          return (
            <div
              key={level.id}
              className={`rounded-2xl border overflow-hidden transition-all hover:shadow-md active:scale-[0.98] ${
                unlocked ? 'bg-card cursor-pointer' : 'bg-muted/20 cursor-not-allowed opacity-60'
              }`}
              onClick={() => unlocked && selectLevel(level.id)}
            >
              {/* Top accent bar */}
              <div
                className="h-1"
                style={{
                  background: lp.percentage === 100
                    ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                    : unlocked
                      ? `linear-gradient(90deg, ${tc.primaryDark}, ${tc.primary})`
                      : 'var(--muted)',
                }}
              />

              <div className="p-4">
                <div className="flex items-center gap-3">
                  {/* Level number badge */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm flex-shrink-0"
                    style={{
                      backgroundColor: lp.percentage === 100 ? '#22c55e' : unlocked ? tc.primary : 'var(--muted)',
                    }}
                  >
                    {lp.percentage === 100 ? <CheckCircle2 className="w-6 h-6" /> : unlocked ? level.order + 1 : <Lock className="w-5 h-5 text-white/60" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base truncate">{level.name}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        {lp.completed}/{lp.total} {t('lesson', lang)}
                      </span>
                      {hasActiveFilters && matchingInLevel > 0 && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-[10px] font-bold">
                          {matchingInLevel}/{lp.total} {t('videosMatchFilter', lang)}
                        </span>
                      )}
                      {!unlocked && (
                        <span className="flex items-center gap-1 text-destructive">
                          <Lock className="w-3 h-3" />
                          {t('levelLocked', lang)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress + arrow */}
                  {unlocked && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-center">
                        <span className="text-sm font-bold" style={{ color: lp.percentage === 100 ? '#22c55e' : tc.primary }}>
                          {lp.percentage}%
                        </span>
                      </div>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${tc.primary}10` }}
                      >
                        <LevelArrow className="w-4 h-4" style={{ color: tc.primary }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                {unlocked && (
                  <div className="mt-3">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${lp.percentage}%`,
                          background: lp.percentage === 100
                            ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                            : `linear-gradient(90deg, ${tc.primaryDark}, ${tc.primary})`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Course Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
          <div className="relative w-full max-w-sm mx-4 bg-background rounded-2xl p-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base">{t('editCourse', lang)}</h3>
              <button onClick={() => setEditModalOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">{t('courseName', lang)}</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-11 rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': tc.primary } as React.CSSProperties}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{t('courseTypeLabel', lang)}</label>
                <input
                  type="text"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full h-11 rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': tc.primary } as React.CSSProperties}
                />
              </div>
              <button
                onClick={handleSaveEdit}
                className="w-full py-3 rounded-xl text-white text-sm font-bold transition-transform active:scale-95 shadow-md"
                style={{ backgroundColor: tc.primary }}
              >
                {t('save', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ LEVEL DETAILS VIEW (shows large lesson cards) ============
export function LevelDetails({ onOpenVideoPlayer }: { onOpenVideoPlayer: (lesson: Lesson, courseId: string, levelId: string) => void }) {
  const { courses, selectedCourseId, selectedLevelId, language, goBack, themeColor } = useAppStore();
  const lang = language;
  const isRTL = lang === 'ar';
  const tc = themeColorMap[themeColor];
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;

  const course = courses.find((c) => c.id === selectedCourseId);
  const level = course?.levels.find((l) => l.id === selectedLevelId);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [confirmDeleteLevel, setConfirmDeleteLevel] = useState(false);

  // Filter state for the LevelDetails toolbar
  const [visibleLessonIds, setVisibleLessonIds] = useState<Set<string>>(new Set());
  const [hideNonMatching, setHideNonMatching] = useState(false);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);

  const handleFilteredLessonsChange = useCallback((info: { filtered: Lesson[]; hideNonMatching: boolean; hasActiveFilters: boolean }) => {
    setVisibleLessonIds(new Set(info.filtered.map((l) => l.id)));
    setHideNonMatching(info.hideNonMatching);
    setHasActiveFilters(info.hasActiveFilters);
  }, []);

  const handleEdit = () => {
    if (!level) return;
    setEditName(level.name);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!course || !level) return;
    const updatedLevels = course.levels.map((l) =>
      l.id === level.id ? { ...l, name: editName } : l
    );
    const updated = { ...course, levels: updatedLevels, updatedAt: Date.now() };
    await updateCourse(updated);
    useAppStore.getState().updateCourseInList(updated);
    setEditModalOpen(false);
  };

  const handleDeleteLevel = async () => {
    if (!course || !level) return;
    if (!confirmDeleteLevel) {
      setConfirmDeleteLevel(true);
      setTimeout(() => setConfirmDeleteLevel(false), 3000);
      return;
    }
    const updatedLevels = course.levels.filter((l) => l.id !== level.id);
    const updated = { ...course, levels: updatedLevels, updatedAt: Date.now() };
    await updateCourse(updated);
    useAppStore.getState().updateCourseInList(updated);
    const progress = await getAllProgress();
    useAppStore.getState().setProgress(progress);
    goBack();
  };

  if (!course || !level) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: `${tc.primary}10` }}>
          <BookOpen className="w-8 h-8" style={{ color: tc.primary }} />
        </div>
        <p className="text-muted-foreground">{t('noCourses', lang)}</p>
      </div>
    );
  }

  const lp = getLevelProgress(level);
  const unlocked = isLevelUnlocked(course, level.order);

  return (
    <div className="pb-4">
      {/* Header */}
      <div
        className="p-4 pb-5"
        style={{
          background: lp.percentage === 100
            ? `linear-gradient(135deg, #059669, #22c55e)`
            : `linear-gradient(135deg, ${tc.primaryDark}, ${tc.primary})`,
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={goBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/20 text-white hover:bg-white/30 transition-colors"
          >
            <BackArrow className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white truncate flex-1">{level.name}</h1>
          <button
            onClick={handleEdit}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/20 text-white hover:bg-white/30 transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={handleDeleteLevel}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              confirmDeleteLevel ? 'bg-red-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs text-white/80 flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            {lp.completed}/{lp.total} {t('lesson', lang)}
          </span>
        </div>

        <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-white transition-all duration-700 ease-out"
            style={{ width: `${lp.percentage}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-white/80">
            {lp.percentage === 100 ? (lang === 'ar' ? 'أكملت المستوى! 🎉' : 'Level completed! 🎉') : `${lp.percentage}% ${t('completion', lang)}`}
          </p>
          {lp.percentage === 100 && <Trophy className="w-4 h-4 text-yellow-300" />}
        </div>
      </div>

      {/* Lesson Cards */}
      <div className="p-4 space-y-4">
        {!unlocked ? (
          <div className="text-center py-8">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">{t('levelLocked', lang)}</p>
          </div>
        ) : (
          <>
            {/* Video Tools Toolbar — placed next to level title */}
            {level.lessons.length > 0 && (
              <div className="rounded-2xl border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4" style={{ color: tc.primary }} />
                  <h3 className="text-sm font-bold" style={{ color: tc.primary }}>
                    {t('levelVideoTools', lang)}
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    {level.lessons.length} {t('lesson', lang)}
                  </span>
                </div>
                <CourseVideoToolbar
                  lessons={level.lessons}
                  course={course}
                  levelName={level.name}
                  onFilteredLessonsChange={handleFilteredLessonsChange}
                  compact
                />
              </div>
            )}

            {hasActiveFilters && hideNonMatching && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 px-3 py-2 text-[11px] text-red-700 dark:text-red-300">
                {t('filteredLessonsHidden', lang)} ({level.lessons.length - visibleLessonIds.size})
              </div>
            )}

            {(() => {
              const lessonsToShow = hasActiveFilters && hideNonMatching
                ? level.lessons.filter((l) => visibleLessonIds.has(l.id))
                : level.lessons;
              if (lessonsToShow.length === 0 && hasActiveFilters) {
                return (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">{t('noVideosMatchFilter', lang)}</p>
                  </div>
                );
              }
              // When filter is active but not hiding, show lessons sorted by
              // the toolbar's filtered order; otherwise keep original order.
              const ordered = hasActiveFilters
                ? level.lessons.filter((l) => visibleLessonIds.has(l.id))
                : level.lessons;
              return ordered.map((lesson) => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  unlocked={isLessonUnlocked(course, level.id, lesson.order)}
                  primaryColor={tc.primary}
                  primaryDark={tc.primaryDark}
                  lang={lang}
                  courseId={course.id}
                  levelId={level.id}
                  onOpenVideoPlayer={onOpenVideoPlayer}
                />
              ));
            })()}
          </>
        )}
      </div>

      {/* Edit Level Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
          <div className="relative w-full max-w-sm mx-4 bg-background rounded-2xl p-5 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base">{t('editLevel', lang)}</h3>
              <button onClick={() => setEditModalOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">{lang === 'ar' ? 'اسم المستوى' : 'Level Name'}</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-11 rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': tc.primary } as React.CSSProperties}
                />
              </div>
              <button
                onClick={handleSaveEdit}
                className="w-full py-3 rounded-xl text-white text-sm font-bold transition-transform active:scale-95 shadow-md"
                style={{ backgroundColor: tc.primary }}
              >
                {t('save', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ LARGE LESSON CARD ============
function LessonCard({
  lesson,
  unlocked,
  primaryColor,
  primaryDark,
  lang,
  courseId,
  levelId,
  onOpenVideoPlayer,
}: {
  lesson: Lesson;
  unlocked: boolean;
  primaryColor: string;
  primaryDark: string;
  lang: 'ar' | 'en';
  courseId: string;
  levelId: string;
  onOpenVideoPlayer: (lesson: Lesson, courseId: string, levelId: string) => void;
}) {
  const handleOpenLesson = () => {
    if (!unlocked) return;
    onOpenVideoPlayer(lesson, courseId, levelId);
  };

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all shadow-sm ${
        lesson.completed
          ? 'bg-gradient-to-br from-green-50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/10 border-green-200 dark:border-green-900/50'
          : unlocked
            ? 'bg-card hover:shadow-lg border-border'
            : 'bg-muted/20 opacity-50 border-muted'
      }`}
    >
      {/* Top accent */}
      {unlocked && !lesson.completed && (
        <div
          className="h-1"
          style={{ background: `linear-gradient(90deg, ${primaryDark}, ${primaryColor})` }}
        />
      )}
      {lesson.completed && (
        <div className="h-1 bg-gradient-to-r from-green-500 to-emerald-400" />
      )}

      <div className="p-5">
        {/* Lesson number badge + status */}
        <div className="flex items-start gap-3 mb-3">
          {/* Number badge */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm"
            style={{
              backgroundColor: lesson.completed ? '#22c55e' : unlocked ? primaryColor : 'var(--muted)',
            }}
          >
            {lesson.completed ? <CheckCircle2 className="w-5 h-5" /> : unlocked ? lesson.order + 1 : <Lock className="w-4 h-4 text-white/60" />}
          </div>

          <div className="flex-1 min-w-0">
            <p className={`font-bold text-base leading-tight ${lesson.completed ? 'line-through text-muted-foreground' : ''}`}>
              {lesson.name}
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              {lesson.duration && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  {lesson.duration}
                </span>
              )}
              {lesson.completed && (
                <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {t('completed', lang)}
                </span>
              )}
              {!unlocked && (
                <span className="text-xs text-destructive flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {t('locked', lang)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Open Lesson Button - WIDE and PROMINENT */}
        {unlocked && (
          <button
            onClick={handleOpenLesson}
            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md ${
              lesson.completed
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'text-white'
            }`}
            style={!lesson.completed ? { background: `linear-gradient(135deg, ${primaryDark}, ${primaryColor})` } : {}}
          >
            {lesson.completed ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                {lang === 'ar' ? 'إعادة مشاهدة الدرس' : 'Re-watch Lesson'}
              </>
            ) : (
              <>
                {t('openLesson', lang)}
              </>
            )}
          </button>
        )}

        {/* Locked overlay message */}
        {!unlocked && (
          <div className="w-full py-3.5 rounded-xl bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">{t('lessonLocked', lang)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
