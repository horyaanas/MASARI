'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore, themeColorMap } from '@/lib/store';
import { t } from '@/lib/i18n';
import { Course, Lesson } from '@/lib/db-indexeddb';
import {
  Filter, FileSpreadsheet, Download, Play, ListVideo,
  Clock, Calendar, X, ChevronDown,
} from 'lucide-react';
import {
  CourseVideoFilters,
  DEFAULT_FILTERS,
  DurationFilter,
  DateFilter,
  SortBy,
  applyFilters,
  hasActiveFilters,
  lessonsToPlayerVideos,
} from '@/lib/course-video-utils';
import { exportLessonsToExcel, downloadBlob, sanitizeFilename } from '@/lib/excel';
import { YouTubePlaylistPlayer, PlaylistPlayerVideo } from './youtube-playlist-player';

interface CourseVideoToolbarProps {
  /** All lessons in scope (course-wide or level-wide). */
  lessons: Lesson[];
  /** Owning course (for export context). */
  course: Course;
  /** Optional level name (for level-context labels & filenames). */
  levelName?: string;
  /** When true, hides the "Play" buttons (e.g. inside CourseDetails where
   *  playback across all levels is less useful). Default: false. */
  hidePlayButton?: boolean;
  /** Called whenever the filtered lessons or hideNonMatching state changes,
   *  so the parent can re-render its lesson/level cards. */
  onFilteredLessonsChange?: (info: {
    filtered: Lesson[];
    hideNonMatching: boolean;
    hasActiveFilters: boolean;
  }) => void;
  /** Compact layout: smaller buttons. Default: false. */
  compact?: boolean;
}

export function CourseVideoToolbar({
  lessons,
  course,
  levelName,
  hidePlayButton = false,
  onFilteredLessonsChange,
  compact = false,
}: CourseVideoToolbarProps) {
  const { language, themeColor } = useAppStore();
  const lang = language;
  const tc = themeColorMap[themeColor];

  const [filters, setFilters] = useState<CourseVideoFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [hideNonMatching, setHideNonMatching] = useState(false);
  const [playerVideos, setPlayerVideos] = useState<PlaylistPlayerVideo[]>([]);
  const [showPlayer, setShowPlayer] = useState(false);

  // Compute filtered lessons
  const filteredLessons = useMemo(() => applyFilters(lessons, filters), [lessons, filters]);
  const active = hasActiveFilters(filters);
  const youtubeCount = useMemo(
    () => filteredLessons.filter((l) => {
      // Count lessons that can be played in the YouTube player
      const vid = l.videoId || extractVidFromUrl(l.url);
      return !!vid;
    }).length,
    [filteredLessons]
  );

  // Notify parent whenever the filtered set or hideNonMatching changes
  useEffect(() => {
    if (onFilteredLessonsChange) {
      onFilteredLessonsChange({
        filtered: filteredLessons,
        hideNonMatching,
        hasActiveFilters: active,
      });
    }
  }, [filteredLessons, hideNonMatching, active, onFilteredLessonsChange]);

  // ============ Handlers ============

  const handleExport = useCallback(
    (exportAll: boolean) => {
      const toExport = exportAll ? lessons : filteredLessons;
      if (toExport.length === 0) return;
      const blob = exportLessonsToExcel(toExport, {
        courseName: course.name,
        courseType: course.type,
        channelTitle: course.channelTitle,
        course,
      });
      const fileBase = levelName
        ? `${sanitizeFilename(course.name)}__${sanitizeFilename(levelName)}`
        : sanitizeFilename(course.name);
      const suffix = exportAll ? '_all' : '_filtered';
      downloadBlob(blob, `${fileBase}${suffix}.xlsx`);
    },
    [lessons, filteredLessons, course, levelName]
  );

  const handlePlay = useCallback(() => {
    const vids = lessonsToPlayerVideos(filteredLessons);
    if (vids.length === 0) return;
    setPlayerVideos(vids);
    setShowPlayer(true);
  }, [filteredLessons]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setHideNonMatching(false);
  }, []);

  const btnPad = compact ? 'px-2 py-1.5 text-[10px]' : 'px-2.5 py-1.5 text-[11px]';

  return (
    <div className="space-y-2">
      {/* Toolbar row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 rounded-lg border font-medium transition-all ${btnPad} ${
            active || showFilters
              ? 'border-red-400 bg-red-50 dark:bg-red-950/20 text-red-600'
              : 'border-border hover:bg-accent'
          }`}
          title={t('filterVideos', lang)}
        >
          <Filter className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          <span>{t('filterVideos', lang)}</span>
          {active && (
            <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center">
              !
            </span>
          )}
        </button>

        {/* Export Filtered */}
        <button
          onClick={() => handleExport(false)}
          disabled={filteredLessons.length === 0}
          className={`flex items-center gap-1 rounded-lg border font-medium transition-colors disabled:opacity-40 ${btnPad}`}
          style={{ color: '#16a34a', borderColor: '#16a34a40' }}
          title={t('exportFiltered', lang)}
        >
          <FileSpreadsheet className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          <span>{t('exportFiltered', lang)}</span>
        </button>

        {/* Export All */}
        <button
          onClick={() => handleExport(true)}
          disabled={lessons.length === 0}
          className={`flex items-center gap-1 rounded-lg border font-medium transition-colors disabled:opacity-40 ${btnPad}`}
          style={{ color: '#16a34a', borderColor: '#16a34a40' }}
          title={t('exportAll', lang)}
        >
          <Download className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          <span>{t('exportAll', lang)}</span>
        </button>

        {/* Play Filtered */}
        {!hidePlayButton && (
          <button
            onClick={handlePlay}
            disabled={youtubeCount === 0}
            className={`flex items-center gap-1 rounded-lg text-white font-bold transition-all active:scale-95 disabled:opacity-40 shadow-sm ${btnPad}`}
            style={{ background: 'linear-gradient(135deg, #FF0000, #CC0000)' }}
            title={t('playAllFiltered', lang)}
          >
            <Play className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            <span>{t('playAllFiltered', lang)}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[9px]">{youtubeCount}</span>
          </button>
        )}
      </div>

      {/* Active filter summary */}
      {active && (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
          <span className="text-[10px] font-medium text-red-700 dark:text-red-300">
            {filteredLessons.length} / {lessons.length} {t('videosMatchFilter', lang)}
            {youtubeCount > 0 && !hidePlayButton && (
              <span className="ml-1 opacity-70">({youtubeCount} {t('play', lang)})</span>
            )}
          </span>
          <button
            onClick={resetFilters}
            className="text-[10px] font-bold text-red-700 dark:text-red-300 hover:underline flex items-center gap-0.5"
          >
            <X className="w-2.5 h-2.5" />
            {t('clearFilters', lang)}
          </button>
        </div>
      )}

      {/* Filter Panel */}
      {showFilters && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10 p-3 space-y-3 animate-fade-in">
          {/* Duration Filter */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1.5">
              <Clock className="w-3 h-3" />
              {t('filterByDuration', lang)}
            </label>
            <div className="grid grid-cols-3 gap-1">
              {([
                { val: 'all' as const,      label: t('allDurations', lang) },
                { val: 'short' as const,    label: t('shortVideos', lang) },
                { val: 'medium' as const,   label: t('mediumVideos', lang) },
                { val: 'long' as const,     label: t('longVideos', lang) },
                { val: 'veryLong' as const, label: t('veryLongVideos', lang) },
              ]).map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => setFilters((f) => ({ ...f, durationFilter: opt.val }))}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                    filters.durationFilter === opt.val
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-background border hover:bg-accent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Filter */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1.5">
              <Calendar className="w-3 h-3" />
              {t('filterByDate', lang)}
            </label>
            <div className="grid grid-cols-4 gap-1">
              {([
                { val: 'all' as const,         label: t('allDates', lang) },
                { val: 'lastWeek' as const,    label: t('lastWeek', lang) },
                { val: 'lastMonth' as const,   label: t('lastMonth', lang) },
                { val: 'last3Months' as const, label: t('last3Months', lang) },
                { val: 'last6Months' as const, label: t('last6Months', lang) },
                { val: 'lastYear' as const,    label: t('lastYear', lang) },
                { val: 'older' as const,       label: t('older', lang) },
              ]).map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => setFilters((f) => ({ ...f, dateFilter: opt.val }))}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                    filters.dateFilter === opt.val
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-background border hover:bg-accent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort By */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1.5">
              <ChevronDown className="w-3 h-3" />
              {t('sortBy', lang)}
            </label>
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value as SortBy }))}
              className="w-full h-9 rounded-lg border bg-background px-2 text-xs focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': tc.primary } as React.CSSProperties}
            >
              <option value="position">{t('sortByPosition', lang)}</option>
              <option value="durationAsc">{t('sortByDurationAsc', lang)}</option>
              <option value="durationDesc">{t('sortByDurationDesc', lang)}</option>
              <option value="dateNewest">{t('sortByDateNewest', lang)}</option>
              <option value="dateOldest">{t('sortByDateOldest', lang)}</option>
              <option value="titleAsc">{t('sortByTitleAsc', lang)}</option>
              <option value="titleDesc">{t('sortByTitleDesc', lang)}</option>
            </select>
          </div>

          {/* Hide non-matching toggle */}
          {active && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hideNonMatching}
                onChange={(e) => setHideNonMatching(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              <span className="text-[11px] font-medium">{t('hideFilteredLessons', lang)}</span>
            </label>
          )}
        </div>
      )}

      {/* Hidden lessons notice */}
      {hideNonMatching && active && filteredLessons.length < lessons.length && (
        <div className="text-[10px] text-muted-foreground italic px-2">
          {t('filteredLessonsHidden', lang)} ({lessons.length - filteredLessons.length})
        </div>
      )}

      {/* YouTube Playlist Player overlay */}
      {showPlayer && playerVideos.length > 0 && (
        <YouTubePlaylistPlayer
          videos={playerVideos}
          playlist={{
            id: course.id,
            title: levelName
              ? `${course.name} — ${levelName}`
              : course.name,
            thumbnail: course.thumbnail || '',
            channelTitle: course.channelTitle || '',
          }}
          startIndex={0}
          onClose={() => {
            setShowPlayer(false);
            setPlayerVideos([]);
          }}
        />
      )}
    </div>
  );
}

// Local helper (avoid circular import with course-video-utils by inlining
// a tiny URL matcher — the full version lives in course-video-utils).
function extractVidFromUrl(url: string): string | null {
  if (!url) return null;
  const patterns: RegExp[] = [
    /(?:youtube\.com\/watch\?v=)([A-Za-z0-9_-]{6,})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{6,})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}
