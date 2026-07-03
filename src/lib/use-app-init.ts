'use client';

import { useEffect, useCallback } from 'react';
import { useAppStore } from './store';
import {
  getAllCourses,
  getAllProgress,
  getSetting,
  setSetting as dbSetSetting,
  saveCourse,
  deleteCourse as dbDeleteCourse,
  toggleLessonComplete as dbToggleLesson,
} from './db-indexeddb';
import { Course, Progress } from './db-indexeddb';
import { Language } from './i18n';
import { FontSize, ThemeColor } from './store';

export function useAppInit() {
  const {
    setCourses,
    setProgress,
    setLanguage,
    setFontSize,
    setThemeColor,
    setIsDarkMode,
    setNotificationsEnabled,
    setReminderTime,
    setIsLoading,
  } = useAppStore();

  useEffect(() => {
    async function init() {
      try {
        // Load courses and progress
        const courses = await getAllCourses();
        const progress = await getAllProgress();
        setCourses(courses);
        setProgress(progress);

        // Load settings
        const lang = await getSetting('language');
        if (lang === 'ar' || lang === 'en') setLanguage(lang as Language);

        const fontSize = await getSetting('fontSize');
        if (fontSize === 'small' || fontSize === 'medium' || fontSize === 'large')
          setFontSize(fontSize as FontSize);

        const themeColor = await getSetting('themeColor');
        if (themeColor && ['emerald', 'teal', 'cyan', 'amber', 'rose', 'violet'].includes(themeColor))
          setThemeColor(themeColor as ThemeColor);

        const darkMode = await getSetting('darkMode');
        if (darkMode === 'true') setIsDarkMode(true);
        else if (darkMode === 'false') setIsDarkMode(false);

        const notif = await getSetting('notificationsEnabled');
        if (notif === 'true') setNotificationsEnabled(true);

        const reminderTime = await getSetting('reminderTime');
        if (reminderTime) setReminderTime(reminderTime);
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);
}

export function useCourseActions() {
  const { addCourseToList, updateCourseInList, removeCourseFromList, setProgress } = useAppStore();

  const addCourse = useCallback(async (course: Course) => {
    await saveCourse(course);
    addCourseToList(course);
    const progress = await getAllProgress();
    setProgress(progress);
  }, [addCourseToList, setProgress]);

  const updateCourse = useCallback(async (course: Course) => {
    const { updateCourse: dbUpdate } = await import('./db-indexeddb');
    await dbUpdate(course);
    updateCourseInList(course);
    const progress = await getAllProgress();
    setProgress(progress);
  }, [updateCourseInList, setProgress]);

  const removeCourse = useCallback(async (courseId: string) => {
    await dbDeleteCourse(courseId);
    removeCourseFromList(courseId);
  }, [removeCourseFromList]);

  const toggleLesson = useCallback(async (courseId: string, levelId: string, lessonId: string) => {
    const updatedCourse = await dbToggleLesson(courseId, levelId, lessonId);
    if (updatedCourse) {
      updateCourseInList(updatedCourse);
      const progress = await getAllProgress();
      setProgress(progress);
      return updatedCourse;
    }
    return null;
  }, [updateCourseInList, setProgress]);

  return { addCourse, updateCourse, removeCourse, toggleLesson };
}

export function useSettingsActions() {
  const { setLanguage, setFontSize, setThemeColor, setIsDarkMode, setNotificationsEnabled, setReminderTime } = useAppStore();

  const changeLanguage = useCallback(async (lang: Language) => {
    await dbSetSetting('language', lang);
    setLanguage(lang);
  }, [setLanguage]);

  const changeFontSize = useCallback(async (size: FontSize) => {
    await dbSetSetting('fontSize', size);
    setFontSize(size);
  }, [setFontSize]);

  const changeThemeColor = useCallback(async (color: ThemeColor) => {
    await dbSetSetting('themeColor', color);
    setThemeColor(color);
  }, [setThemeColor]);

  const changeDarkMode = useCallback(async (dark: boolean) => {
    await dbSetSetting('darkMode', String(dark));
    setIsDarkMode(dark);
  }, [setIsDarkMode]);

  const changeNotifications = useCallback(async (enabled: boolean) => {
    await dbSetSetting('notificationsEnabled', String(enabled));
    setNotificationsEnabled(enabled);
  }, [setNotificationsEnabled]);

  const changeReminderTime = useCallback(async (time: string) => {
    await dbSetSetting('reminderTime', time);
    setReminderTime(time);
  }, [setReminderTime]);

  return { changeLanguage, changeFontSize, changeThemeColor, changeDarkMode, changeNotifications, changeReminderTime };
}
