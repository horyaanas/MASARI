'use client';

import React from 'react';
import { useAppStore, themeColorMap } from '@/lib/store';
import { t } from '@/lib/i18n';
import { getNextLesson } from '@/lib/db-indexeddb';
import { Search, BookOpen, TrendingUp, Play, Sparkles, GraduationCap } from 'lucide-react';

export function Dashboard() {
  const { courses, progressMap, language, searchQuery, setSearchQuery, selectCourse, setImportModalOpen, setYouTubeImportOpen, themeColor } = useAppStore();
  const lang = language;
  const isRTL = lang === 'ar';
  const tc = themeColorMap[themeColor];

  // Calculate overall stats
  const totalCourses = courses.length;
  const overallPercentage = totalCourses > 0
    ? Math.round(courses.reduce((sum, c) => {
        const p = progressMap[c.id];
        return sum + (p?.percentage || 0);
      }, 0) / totalCourses)
    : 0;

  const totalLessons = courses.reduce((sum, c) => sum + c.levels.reduce((s, l) => s + l.lessons.length, 0), 0);
  const completedLessons = courses.reduce((sum, c) => sum + c.levels.reduce((s, l) => s + l.lessons.filter(ls => ls.completed).length, 0), 0);

  // Get upcoming (incomplete) lessons
  const upcomingLessons: { courseId: string; courseName: string; courseType: string; lesson: ReturnType<typeof getNextLesson> }[] = [];
  for (const course of courses) {
    const next = getNextLesson(course);
    if (next) {
      upcomingLessons.push({
        courseId: course.id,
        courseName: course.name,
        courseType: course.type,
        lesson: next,
      });
    }
  }

  // Filter by search
  const filteredUpcoming = searchQuery
    ? upcomingLessons.filter(
        (u) =>
          u.courseName.includes(searchQuery) ||
          u.lesson?.lesson.name.includes(searchQuery) ||
          u.courseType.includes(searchQuery)
      )
    : upcomingLessons;

  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (overallPercentage / 100) * circumference;

  return (
    <div className="space-y-5">
      {/* Hero Section with Progress Ring - more compact */}
      <div
        className="relative mx-4 mt-4 rounded-2xl p-4 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${tc.primaryDark}, ${tc.primary})`,
        }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full border-4 border-white" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full border-4 border-white" />
        </div>

        <div className="relative flex items-center justify-between">
          <div className="flex-1 text-white">
            <p className="text-white/70 text-[10px] mb-0.5">{lang === 'ar' ? 'مرحباً بك 👋' : 'Welcome 👋'}</p>
            <h2 className="text-lg font-bold mb-1">{t('appName', lang)}</h2>
            <div className="flex items-center gap-3 mt-2">
              <div>
                <p className="text-xl font-bold">{totalCourses}</p>
                <p className="text-white/70 text-[9px]">{t('totalCourses', lang)}</p>
              </div>
              <div className="w-px h-6 bg-white/20" />
              <div>
                <p className="text-xl font-bold">{completedLessons}/{totalLessons}</p>
                <p className="text-white/70 text-[9px]">{t('lesson', lang)}</p>
              </div>
            </div>
          </div>

          {/* Progress Ring - smaller */}
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.2)" strokeWidth="6" fill="none" />
              <circle
                cx="50" cy="50" r="40"
                stroke="white"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <span className="text-lg font-bold">{overallPercentage}%</span>
              <span className="text-[7px] text-white/70">{t('overallProgress', lang)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-5">
        {/* Quick Stats - compact single row */}
        <div className="grid grid-cols-3 gap-2">
          <div
            className="rounded-xl p-2.5 border bg-card shadow-sm flex items-center gap-2 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => selectCourse(courses.find(c => progressMap[c.id]?.percentage !== 100 && getNextLesson(c))?.id || '')}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${tc.primary}15` }}
            >
              <Play className="w-4 h-4" style={{ color: tc.primary }} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground leading-tight">{lang === 'ar' ? 'متابعة' : 'Continue'}</p>
              <p className="text-xs font-bold leading-tight">{filteredUpcoming.length}</p>
            </div>
          </div>

          <div
            className="rounded-xl p-2.5 border bg-card shadow-sm flex items-center gap-2 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setImportModalOpen(true)}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${tc.primary}15` }}
            >
              <GraduationCap className="w-4 h-4" style={{ color: tc.primary }} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground leading-tight">{t('fromExcel', lang)}</p>
              <p className="text-xs font-bold leading-tight">{t('addCourse', lang)}</p>
            </div>
          </div>

          <div
            className="rounded-xl p-2.5 border bg-card shadow-sm flex items-center gap-2 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setYouTubeImportOpen(true)}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: '#EF444415' }}
            >
              <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground leading-tight">{t('fromYouTube', lang)}</p>
              <p className="text-xs font-bold leading-tight">{t('addCourse', lang)}</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder', lang)}
            className={`w-full h-10 rounded-xl border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:border-transparent transition-shadow ${isRTL ? 'pr-10' : 'pl-10'}`}
            style={{ '--tw-ring-color': tc.primary } as React.CSSProperties}
          />
        </div>

        {/* Upcoming Lessons */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold">{t('upcomingLessons', lang)}</h2>
            {filteredUpcoming.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {filteredUpcoming.length} {lang === 'ar' ? 'دروس' : 'lessons'}
              </span>
            )}
          </div>

          {filteredUpcoming.length === 0 ? (
            <div className="text-center py-12">
              {totalCourses === 0 ? (
                <div className="space-y-4">
                  <div
                    className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center"
                    style={{ backgroundColor: `${tc.primary}10` }}
                  >
                    <Sparkles className="w-10 h-10" style={{ color: tc.primary }} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">{t('noCoursesYet', lang)}</p>
                    <p className="text-xs text-muted-foreground">{t('addFirstCourse', lang)}</p>
                  </div>
                  <button
                    onClick={() => setImportModalOpen(true)}
                    className="px-6 py-2.5 rounded-xl text-white text-sm font-medium transition-transform active:scale-95 shadow-lg"
                    style={{ backgroundColor: tc.primary }}
                  >
                    {t('importFromExcel', lang)}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
                    style={{ backgroundColor: `${tc.primary}10` }}
                  >
                    <GraduationCap className="w-8 h-8" style={{ color: tc.primary }} />
                  </div>
                  <p className="text-muted-foreground text-sm">{t('noUpcomingLessons', lang)}</p>
                  <p className="text-xs text-muted-foreground">
                    {lang === 'ar' ? 'أحسنت! أكملت جميع الدروس المتاحة 🎉' : 'Great! You completed all available lessons 🎉'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUpcoming.slice(0, 10).map((item, index) => (
                <div
                  key={`${item.courseId}-${item.lesson?.lesson.id}`}
                  className="rounded-xl border bg-card p-3.5 shadow-sm hover:shadow-md transition-all active:scale-[0.98] cursor-pointer"
                  onClick={() => selectCourse(item.courseId)}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.lesson?.lesson.name}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {item.courseType && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full text-white font-medium"
                            style={{ backgroundColor: tc.primary }}
                          >
                            {item.courseType}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {item.lesson?.level.name}
                        </span>
                      </div>
                      <div className="mt-2.5 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${progressMap[item.courseId]?.percentage || 0}%`,
                            backgroundColor: progressMap[item.courseId]?.percentage === 100 ? '#22c55e' : tc.primary,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ms-3">
                      <div className="text-center">
                        <span className="text-sm font-bold" style={{ color: tc.primary }}>
                          {progressMap[item.courseId]?.percentage || 0}%
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          selectCourse(item.courseId);
                        }}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-transform active:scale-90 shadow-md"
                        style={{ backgroundColor: tc.primary }}
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
