import * as XLSX from 'xlsx';
import { Course, Level, Lesson } from './db-indexeddb';

export interface ExcelSheet {
  name: string;
  data: Record<string, unknown>[];
  columns: string[];
}

export interface ColumnMapping {
  courseType: string;
  level: string;
  lessonName: string;
  lessonUrl: string;
  duration: string;
}

export function parseExcelFile(file: ArrayBuffer): ExcelSheet[] {
  const workbook = XLSX.read(file, { type: 'array' });
  const sheets: ExcelSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    sheets.push({ name: sheetName, data, columns });
  }

  return sheets;
}

export function autoDetectColumns(columns: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const lower = columns.map((c) => c.toLowerCase().trim());

  // Course Type detection
  const typeKeywords = ['type', 'course type', 'نوع', 'نوع الدورة', 'category', 'تصنيف'];
  const typeIdx = lower.findIndex((c) => typeKeywords.some((k) => c.includes(k)));
  if (typeIdx >= 0) mapping.courseType = columns[typeIdx];

  // Level detection
  const levelKeywords = ['level', 'مستوى', 'المستوى', 'مرحلة', 'stage'];
  const levelIdx = lower.findIndex((c) => levelKeywords.some((k) => c.includes(k)));
  if (levelIdx >= 0) mapping.level = columns[levelIdx];

  // Lesson Name detection
  const nameKeywords = ['lesson', 'name', 'title', 'درس', 'اسم', 'اسم الدرس', 'عنوان', 'lesson name'];
  const nameIdx = lower.findIndex((c) => nameKeywords.some((k) => c.includes(k)));
  if (nameIdx >= 0) mapping.lessonName = columns[nameIdx];

  // URL detection
  const urlKeywords = ['url', 'link', 'href', 'رابط', 'رابط الدرس', 'وصلة'];
  const urlIdx = lower.findIndex((c) => urlKeywords.some((k) => c.includes(k)));
  if (urlIdx >= 0) mapping.lessonUrl = columns[urlIdx];

  // Duration detection
  const durKeywords = ['duration', 'time', 'length', 'مدة', 'المدة', 'وقت'];
  const durIdx = lower.findIndex((c) => durKeywords.some((k) => c.includes(k)));
  if (durIdx >= 0) mapping.duration = columns[durIdx];

  return mapping;
}

export function buildCourseFromData(
  courseName: string,
  courseType: string,
  sheetData: Record<string, unknown>[],
  mapping: ColumnMapping
): Course {
  const levelsMap = new Map<string, Lesson[]>();
  let lessonOrder = 0;

  for (const row of sheetData) {
    const levelName = String(row[mapping.level] || 'المستوى 1');
    const lessonName = String(row[mapping.lessonName] || 'درس بدون اسم');
    const lessonUrl = String(row[mapping.lessonUrl] || '');
    const duration = String(row[mapping.duration] || '');

    if (!levelsMap.has(levelName)) {
      levelsMap.set(levelName, []);
      lessonOrder = 0;
    }

    const levelLessons = levelsMap.get(levelName)!;
    const lessonId = `lesson-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    levelLessons.push({
      id: lessonId,
      levelId: '',
      courseId: '',
      name: lessonName,
      url: lessonUrl,
      duration,
      order: lessonOrder++,
      completed: false,
    });
  }

  const levels: Level[] = [];
  let levelOrder = 0;
  for (const [levelName, lessons] of levelsMap) {
    const levelId = `level-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    lessons.forEach((l) => (l.levelId = levelId));
    levels.push({
      id: levelId,
      courseId: '',
      name: levelName,
      order: levelOrder++,
      lessons,
    });
  }

  const courseId = `course-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  levels.forEach((l) => (l.courseId = courseId));

  return {
    id: courseId,
    name: courseName,
    type: courseType,
    levels,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============ YouTube Playlist Export ============

export interface YouTubePlaylistVideo {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  durationMinutes: number;
  durationSeconds: number;
  position: number;
  channelTitle: string;
  addedToPlaylistAt: string;
  publishedAt: string;
}

export interface YouTubePlaylistInfo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  videoCount: number;
  videos: YouTubePlaylistVideo[];
}

/**
 * Export YouTube playlist videos to a formatted Arabic Excel file.
 * The file is structured to be importable back into the app via the Excel import wizard.
 *
 * Columns (Arabic headers):
 *  - نوع الدورة
 *  - المستوى
 *  - اسم الدرس
 *  - رابط الدرس
 *  - مدة الدرس
 *  - معرف الفيديو
 *  - القناة
 *  - تاريخ النشر
 *  - تاريخ الإضافة للقائمة
 *  - رقم الفيديو
 */
export function exportYouTubePlaylistToExcel(
  playlist: YouTubePlaylistInfo,
  options: {
    videos: YouTubePlaylistVideo[]; // already filtered/sorted list to export
    courseName?: string;
    courseType?: string;
    levelName?: string;
  }
): Blob {
  const { videos, courseName, courseType, levelName } = options;
  const effectiveCourseName = courseName || playlist.title;
  const effectiveCourseType = courseType || 'يوتيوب';
  const effectiveLevelName = levelName || 'المستوى الأول';

  // Build rows
  const rows = videos.map((video, idx) => ({
    'نوع الدورة': effectiveCourseType,
    'المستوى': effectiveLevelName,
    'اسم الدرس': video.title,
    'رابط الدرس': `https://www.youtube.com/watch?v=${video.videoId}`,
    'مدة الدرس': video.duration,
    'معرف الفيديو': video.videoId,
    'القناة': video.channelTitle,
    'تاريخ النشر': video.publishedAt ? new Date(video.publishedAt).toLocaleDateString('ar-SA') : '',
    'تاريخ الإضافة للقائمة': video.addedToPlaylistAt ? new Date(video.addedToPlaylistAt).toLocaleDateString('ar-SA') : '',
    'رقم الفيديو': idx + 1,
  }));

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      'نوع الدورة',
      'المستوى',
      'اسم الدرس',
      'رابط الدرس',
      'مدة الدرس',
      'معرف الفيديو',
      'القناة',
      'تاريخ النشر',
      'تاريخ الإضافة للقائمة',
      'رقم الفيديو',
    ],
  });

  // Set column widths
  worksheet['!cols'] = [
    { wch: 15 }, // نوع الدورة
    { wch: 15 }, // المستوى
    { wch: 50 }, // اسم الدرس
    { wch: 50 }, // رابط الدرس
    { wch: 12 }, // مدة الدرس
    { wch: 15 }, // معرف الفيديو
    { wch: 25 }, // القناة
    { wch: 15 }, // تاريخ النشر
    { wch: 18 }, // تاريخ الإضافة للقائمة
    { wch: 10 }, // رقم الفيديو
  ];

  // Set RTL view (right-to-left)
  worksheet['!views'] = [{ RTL: true }];

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, effectiveCourseName.substring(0, 30) || 'قائمة يوتيوب');

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Triggers download of a Blob as a file
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Sanitize a string for use as a filename
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

// ============ Export already-imported lessons to Excel ============

import { getLessonDurationSeconds } from './course-video-utils';

/**
 * Export an array of already-imported lessons to a formatted Arabic Excel file.
 * Produces the same column structure as `exportYouTubePlaylistToExcel`,
 * so the exported file can be re-imported into the app via the Excel wizard.
 *
 * If `course` is provided, each row records the lesson's original level name
 * (looked up from the course) so multi-level courses preserve their
 * structure on re-import.
 */
export function exportLessonsToExcel(
  lessons: Lesson[],
  options: {
    courseName: string;
    courseType?: string;
    channelTitle?: string;
    course?: Course;
  }
): Blob {
  const { courseName, courseType, channelTitle, course } = options;
  const effectiveCourseType = courseType || 'يوتيوب';

  // Build a levelId -> level name lookup table for accurate level names
  const levelNameMap = new Map<string, string>();
  if (course) {
    for (const level of course.levels) {
      levelNameMap.set(level.id, level.name);
    }
  }

  const rows = lessons.map((lesson, idx) => ({
    'نوع الدورة': effectiveCourseType,
    'المستوى': levelNameMap.get(lesson.levelId) || 'المستوى الأول',
    'اسم الدرس': lesson.name,
    'رابط الدرس': lesson.url,
    'مدة الدرس': lesson.duration || '',
    'معرف الفيديو': lesson.videoId || '',
    'القناة': lesson.channelTitle || channelTitle || '',
    'تاريخ النشر': lesson.publishedAt ? new Date(lesson.publishedAt).toLocaleDateString('ar-SA') : '',
    'تاريخ الإضافة للقائمة': lesson.addedToPlaylistAt ? new Date(lesson.addedToPlaylistAt).toLocaleDateString('ar-SA') : '',
    'رقم الفيديو': idx + 1,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      'نوع الدورة',
      'المستوى',
      'اسم الدرس',
      'رابط الدرس',
      'مدة الدرس',
      'معرف الفيديو',
      'القناة',
      'تاريخ النشر',
      'تاريخ الإضافة للقائمة',
      'رقم الفيديو',
    ],
  });

  worksheet['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 50 }, { wch: 50 }, { wch: 12 },
    { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 18 }, { wch: 10 },
  ];
  worksheet['!views'] = [{ RTL: true }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeFilename(courseName).substring(0, 30) || 'تصدير');

  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// Re-export the duration helper for convenience
export { getLessonDurationSeconds };
