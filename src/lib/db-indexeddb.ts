import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Course {
  id: string;
  name: string;
  type: string;
  levels: Level[];
  createdAt: number;
  updatedAt: number;
  // YouTube source metadata
  thumbnail?: string;
  sourceType?: 'excel' | 'youtube' | 'manual';
  sourceUrl?: string;
  channelTitle?: string;
}

export interface Level {
  id: string;
  courseId: string;
  name: string;
  order: number;
  lessons: Lesson[];
}

export interface Lesson {
  id: string;
  levelId: string;
  courseId: string;
  name: string;
  url: string;
  duration: string;
  order: number;
  completed: boolean;
  // YouTube video metadata
  thumbnail?: string;
  videoId?: string;
  // Extended metadata (populated for YouTube-sourced lessons; safe to be undefined for Excel/manual lessons)
  durationSeconds?: number;
  publishedAt?: string;       // ISO date the video was published on YouTube
  addedToPlaylistAt?: string; // ISO date the video was added to the source playlist
  channelTitle?: string;
}

export interface Progress {
  courseId: string;
  completedLessons: number;
  totalLessons: number;
  percentage: number;
  lastStudiedAt: number | null;
}

interface AppDB extends DBSchema {
  courses: {
    key: string;
    value: Course;
    indexes: { 'by-name': string };
  };
  progress: {
    key: string;
    value: Progress;
    indexes: { 'by-course': string };
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: string;
    };
  };
}

let dbInstance: IDBPDatabase<AppDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<AppDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<AppDB>('learning-path-db', 1, {
    upgrade(db) {
      const courseStore = db.createObjectStore('courses', { keyPath: 'id' });
      courseStore.createIndex('by-name', 'name');

      const progressStore = db.createObjectStore('progress', { keyPath: 'courseId' });
      progressStore.createIndex('by-course', 'courseId');

      db.createObjectStore('settings', { keyPath: 'key' });
    },
  });

  return dbInstance;
}

// Course operations
export async function getAllCourses(): Promise<Course[]> {
  const db = await getDB();
  return db.getAll('courses');
}

export async function getCourse(id: string): Promise<Course | undefined> {
  const db = await getDB();
  return db.get('courses', id);
}

export async function saveCourse(course: Course): Promise<void> {
  const db = await getDB();
  await db.put('courses', course);
  await updateProgress(course.id);
}

export async function deleteCourse(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('courses', id);
  await db.delete('progress', id);
}

export async function updateCourse(course: Course): Promise<void> {
  const db = await getDB();
  const existing = await db.get('courses', course.id);
  if (existing) {
    // Preserve progress - keep completed states
    const existingLessonMap = new Map<string, boolean>();
    for (const level of existing.levels) {
      for (const lesson of level.lessons) {
        existingLessonMap.set(lesson.id, lesson.completed);
      }
    }
    for (const level of course.levels) {
      for (const lesson of level.lessons) {
        if (existingLessonMap.has(lesson.id)) {
          lesson.completed = existingLessonMap.get(lesson.id)!;
        }
      }
    }
  }
  course.updatedAt = Date.now();
  await db.put('courses', course);
  await updateProgress(course.id);
}

// Lesson completion
export async function toggleLessonComplete(courseId: string, levelId: string, lessonId: string): Promise<Course | undefined> {
  const db = await getDB();
  const course = await db.get('courses', courseId);
  if (!course) return undefined;

  const level = course.levels.find((l) => l.id === levelId);
  if (!level) return undefined;

  const lesson = level.lessons.find((l) => l.id === lessonId);
  if (!lesson) return undefined;

  lesson.completed = !lesson.completed;
  course.updatedAt = Date.now();

  await db.put('courses', course);
  await updateProgress(courseId);

  return course;
}

// Progress operations
export async function getProgress(courseId: string): Promise<Progress | undefined> {
  const db = await getDB();
  return db.get('progress', courseId);
}

export async function getAllProgress(): Promise<Progress[]> {
  const db = await getDB();
  return db.getAll('progress');
}

async function updateProgress(courseId: string): Promise<void> {
  const db = await getDB();
  const course = await db.get('courses', courseId);
  if (!course) return;

  let totalLessons = 0;
  let completedLessons = 0;
  let lastStudiedAt: number | null = null;

  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      totalLessons++;
      if (lesson.completed) {
        completedLessons++;
        if (!lastStudiedAt || course.updatedAt > lastStudiedAt) {
          lastStudiedAt = course.updatedAt;
        }
      }
    }
  }

  const percentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  await db.put('progress', {
    courseId,
    completedLessons,
    totalLessons,
    percentage,
    lastStudiedAt,
  });
}

export async function getOverallProgress(): Promise<{ totalCourses: number; overallPercentage: number }> {
  const courses = await getAllCourses();
  const allProgress = await getAllProgress();

  if (courses.length === 0) return { totalCourses: 0, overallPercentage: 0 };

  const overallPercentage =
    allProgress.length > 0
      ? Math.round(allProgress.reduce((sum, p) => sum + p.percentage, 0) / allProgress.length)
      : 0;

  return { totalCourses: courses.length, overallPercentage };
}

// Settings operations
export async function getSetting(key: string): Promise<string | undefined> {
  const db = await getDB();
  const setting = await db.get('settings', key);
  return setting?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key, value });
}

// Get next incomplete lesson for a course
export function getNextLesson(course: Course): { lesson: Lesson; level: Level } | null {
  for (const level of course.levels) {
    for (const lesson of level.lessons) {
      if (!lesson.completed) {
        return { lesson, level };
      }
    }
  }
  return null;
}

// Check if a level is unlocked
export function isLevelUnlocked(course: Course, levelOrder: number): boolean {
  if (levelOrder === 0) return true;
  const previousLevel = course.levels.find((l) => l.order === levelOrder - 1);
  if (!previousLevel) return false;
  return previousLevel.lessons.every((l) => l.completed);
}

// Check if a lesson is unlocked
export function isLessonUnlocked(course: Course, levelId: string, lessonOrder: number): boolean {
  const level = course.levels.find((l) => l.id === levelId);
  if (!level) return false;

  // Check if level is unlocked
  if (!isLevelUnlocked(course, level.order)) return false;

  // First lesson in level is always unlocked if level is unlocked
  if (lessonOrder === 0) return true;

  // Previous lesson must be completed
  const previousLesson = level.lessons.find((l) => l.order === lessonOrder - 1);
  if (!previousLesson) return false;
  return previousLesson.completed;
}

// Get level progress
export function getLevelProgress(level: Level): { completed: number; total: number; percentage: number } {
  const total = level.lessons.length;
  const completed = level.lessons.filter((l) => l.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percentage };
}
