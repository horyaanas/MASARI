/**
 * Shared utilities for filtering, sorting, and exporting lessons
 * in the course-details and level-details views.
 *
 * These helpers are used by the CourseVideoToolbar component so the
 * same filter/export/play features that exist in the YouTube import
 * wizard are also available on already-imported courses.
 */

import { Course, Level, Lesson } from './db-indexeddb';
import { PlaylistPlayerVideo } from '@/components/app/youtube-playlist-player';

// ============ Types ============

export type DurationFilter = 'all' | 'short' | 'medium' | 'long' | 'veryLong';
export type DateFilter = 'all' | 'lastWeek' | 'lastMonth' | 'last3Months' | 'last6Months' | 'lastYear' | 'older';
export type SortBy = 'position' | 'durationAsc' | 'durationDesc' | 'dateNewest' | 'dateOldest' | 'titleAsc' | 'titleDesc';

export interface CourseVideoFilters {
  durationFilter: DurationFilter;
  dateFilter: DateFilter;
  sortBy: SortBy;
}

export const DEFAULT_FILTERS: CourseVideoFilters = {
  durationFilter: 'all',
  dateFilter: 'all',
  sortBy: 'position',
};

// ============ Duration parsing ============

/**
 * Parse a duration string ("5:30", "1:23:45", "PT5M30S") into seconds.
 * Returns 0 when the string cannot be parsed.
 */
export function parseDurationToSeconds(duration: string | undefined | null): number {
  if (!duration) return 0;
  const s = String(duration).trim();
  if (!s) return 0;

  // ISO 8601 PT#H#M#S form (YouTube API format)
  const isoMatch = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (isoMatch) {
    const [, h, m, sec] = isoMatch;
    return (parseInt(h || '0', 10) * 3600) + (parseInt(m || '0', 10) * 60) + parseInt(sec || '0', 10);
  }

  // HH:MM:SS or MM:SS
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

/**
 * Returns the duration in seconds for a lesson, preferring the stored
 * numeric value, falling back to parsing the duration string.
 */
export function getLessonDurationSeconds(lesson: Lesson): number {
  if (typeof lesson.durationSeconds === 'number' && lesson.durationSeconds > 0) {
    return lesson.durationSeconds;
  }
  return parseDurationToSeconds(lesson.duration);
}

// ============ Video ID extraction ============

const YT_URL_PATTERNS: RegExp[] = [
  /(?:youtube\.com\/watch\?v=)([A-Za-z0-9_-]{6,})/,
  /(?:youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/,
  /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,})/,
];

/**
 * Extract a YouTube videoId from a URL string.
 * Returns the lesson's stored videoId if available, else parses from URL.
 */
export function extractVideoId(lesson: Lesson): string | null {
  if (lesson.videoId) return lesson.videoId;
  if (!lesson.url) return null;
  for (const re of YT_URL_PATTERNS) {
    const m = lesson.url.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

/**
 * Whether a lesson is a YouTube video (and therefore playable inside
 * the YouTube IFrame player).
 */
export function isYouTubeLesson(lesson: Lesson): boolean {
  return extractVideoId(lesson) !== null;
}

// ============ Date helpers ============

function getDateFilterCutoff(dateFilter: DateFilter): number {
  const now = Date.now();
  switch (dateFilter) {
    case 'lastWeek':    return now - 7 * 24 * 60 * 60 * 1000;
    case 'lastMonth':   return now - 30 * 24 * 60 * 60 * 1000;
    case 'last3Months': return now - 90 * 24 * 60 * 60 * 1000;
    case 'last6Months': return now - 180 * 24 * 60 * 60 * 1000;
    case 'lastYear':    return now - 365 * 24 * 60 * 60 * 1000;
    case 'older':       return now - 365 * 24 * 60 * 60 * 1000; // older than 1 year
    default:            return 0;
  }
}

// ============ Filter & sort ============

const DURATION_RANGES: Record<Exclude<DurationFilter, 'all'>, [number, number]> = {
  short:    [0, 5 * 60],
  medium:   [5 * 60, 20 * 60],
  long:     [20 * 60, 60 * 60],
  veryLong: [60 * 60, Infinity],
};

export function applyFilters(lessons: Lesson[], filters: CourseVideoFilters): Lesson[] {
  let result = lessons.slice();

  // Duration filter
  if (filters.durationFilter !== 'all') {
    const range = DURATION_RANGES[filters.durationFilter];
    result = result.filter((lesson) => {
      const sec = getLessonDurationSeconds(lesson);
      if (sec === 0) return false;
      return sec >= range[0] && sec < range[1];
    });
  }

  // Date filter (uses publishedAt; falls back to addedToPlaylistAt)
  if (filters.dateFilter !== 'all') {
    const cutoff = getDateFilterCutoff(filters.dateFilter);
    result = result.filter((lesson) => {
      const dateStr = lesson.publishedAt || lesson.addedToPlaylistAt;
      if (!dateStr) return false;
      const t = new Date(dateStr).getTime();
      if (isNaN(t)) return false;
      if (filters.dateFilter === 'older') return t < cutoff;
      return t >= cutoff;
    });
  }

  // Sort
  result = sortLessons(result, filters.sortBy);
  return result;
}

export function sortLessons(lessons: Lesson[], sortBy: SortBy): Lesson[] {
  const arr = lessons.slice();
  switch (sortBy) {
    case 'position':     return arr.sort((a, b) => a.order - b.order);
    case 'durationAsc':  return arr.sort((a, b) => getLessonDurationSeconds(a) - getLessonDurationSeconds(b));
    case 'durationDesc': return arr.sort((a, b) => getLessonDurationSeconds(b) - getLessonDurationSeconds(a));
    case 'dateNewest':   return arr.sort((a, b) => dateTs(b) - dateTs(a));
    case 'dateOldest':   return arr.sort((a, b) => dateTs(a) - dateTs(b));
    case 'titleAsc':     return arr.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    case 'titleDesc':    return arr.sort((a, b) => b.name.localeCompare(a.name, 'ar'));
    default:             return arr;
  }
}

function dateTs(lesson: Lesson): number {
  const s = lesson.publishedAt || lesson.addedToPlaylistAt;
  if (!s) return 0;
  const t = new Date(s).getTime();
  return isNaN(t) ? 0 : t;
}

export function hasActiveFilters(filters: CourseVideoFilters): boolean {
  return filters.durationFilter !== 'all' || filters.dateFilter !== 'all' || filters.sortBy !== 'position';
}

// ============ Collecting lessons across course / level ============

export function getCourseLessons(course: Course): Lesson[] {
  const out: Lesson[] = [];
  for (const level of course.levels) {
    for (const lesson of level.lessons) out.push(lesson);
  }
  return out;
}

export function getLevelLessons(level: Level): Lesson[] {
  return level.lessons.slice();
}

// ============ Convert Lesson[] to PlaylistPlayerVideo[] ============

/**
 * Convert Lesson[] to PlaylistPlayerVideo[] for the YouTubePlaylistPlayer.
 * Non-YouTube lessons (no extractable videoId) are skipped.
 */
export function lessonsToPlayerVideos(lessons: Lesson[]): PlaylistPlayerVideo[] {
  const out: PlaylistPlayerVideo[] = [];
  let position = 0;
  for (const lesson of lessons) {
    const videoId = extractVideoId(lesson);
    if (!videoId) continue;
    out.push({
      videoId,
      title: lesson.name,
      thumbnail: lesson.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: lesson.duration || '',
      durationSeconds: getLessonDurationSeconds(lesson),
      position: position++,
      channelTitle: lesson.channelTitle || '',
      publishedAt: lesson.publishedAt || '',
    });
  }
  return out;
}
