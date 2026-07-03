'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore, themeColorMap, fontSizeMap } from '@/lib/store';
import { useAppInit } from '@/lib/use-app-init';
import { AppShell } from '@/components/app/app-shell';
import { Dashboard } from '@/components/app/dashboard';
import { CoursesList } from '@/components/app/courses-list';
import { CourseDetails, LevelDetails } from '@/components/app/course-details';
import { Settings } from '@/components/app/settings';
import { ImportModal } from '@/components/app/import-modal';
import { YouTubeImport } from '@/components/app/youtube-import';
import { VideoPlayer } from '@/components/app/video-player';
import { t } from '@/lib/i18n';
import { toggleLessonComplete, getAllProgress, Lesson } from '@/lib/db-indexeddb';

export default function Home() {
  const { currentView, language, fontSize, themeColor, isDarkMode, isLoading } = useAppStore();
  const tc = themeColorMap[themeColor];
  const fs = fontSizeMap[fontSize];

  // Video player state
  const [activeVideoLesson, setActiveVideoLesson] = useState<{
    lesson: Lesson;
    courseId: string;
    levelId: string;
  } | null>(null);

  // Initialize app data
  useAppInit();

  // Apply dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Apply font size
  useEffect(() => {
    document.documentElement.style.fontSize = fs.base;
  }, [fs.base]);

  // Apply theme color CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--theme-primary', tc.primary);
    document.documentElement.style.setProperty('--theme-primary-light', tc.primaryLight);
    document.documentElement.style.setProperty('--theme-primary-dark', tc.primaryDark);

    // Update meta theme-color for PWA
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDarkMode ? '#0f172a' : tc.primary);
    }
  }, [tc, isDarkMode]);

  // Apply direction
  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  // Register service worker with aggressive update detection
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;

    const handleControllerChange = () => {
      // When a new SW takes control, force a reload ONCE to pick up new HTML
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Listen for messages from the SW
    const handleMessage = (event: MessageEvent) => {
      const data = event.data || {};
      if (data.type === 'FORCE_RELOAD') {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // When a new SW is found and installed, force it to activate immediately
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // There's already an active SW (the old one) — tell the new one to skip waiting
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // Also trigger an update check immediately on load
        reg.update().catch(() => {});
      })
      .catch(() => {
        // SW registration failed - app still works
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  // ---- Version check: detect new deployments and force reload ----
  // This catches the case where the SW was updated but the HTML is stale.
  // We fetch /version.json with a cache-busting query so the OLD SW
  // (which uses stale-while-revalidate) still has to go to the network.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const CURRENT_VERSION = '1.2.0';
    let isReloading = false;

    const checkVersion = async () => {
      if (isReloading) return;
      try {
        const res = await fetch(`/version.json?cb=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.version && data.version !== CURRENT_VERSION) {
          isReloading = true;
          // Clear caches then reload with cache-busting query
          if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
          }
          // Reload with a cache-busting query so the OLD SW can't serve stale HTML
          window.location.href = window.location.pathname + `?v=${data.version}${window.location.hash}`;
        }
      } catch {
        // ignore — probably offline
      }
    };

    // Check on mount (after a small delay to let the app render)
    const initialTimer = setTimeout(checkVersion, 1500);

    // Check when the tab becomes visible again (user returns to the app)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Check periodically while the app is open (every 5 minutes)
    const interval = setInterval(checkVersion, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Request notification permission when enabled
  useEffect(() => {
    if ('Notification' in window && useAppStore.getState().notificationsEnabled) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [useAppStore.getState().notificationsEnabled]);

  // Schedule daily reminder
  useEffect(() => {
    if (!useAppStore.getState().notificationsEnabled) return;

    const checkReminder = () => {
      const now = new Date();
      const reminderTime = useAppStore.getState().reminderTime;
      const [hours, minutes] = reminderTime.split(':').map(Number);

      if (now.getHours() === hours && now.getMinutes() === minutes) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(language === 'ar' ? 'تذكير بالدراسة 📚' : 'Study Reminder 📚', {
            body: language === 'ar' ? 'حان وقت الدراسة! واصل تقدمك.' : "It's time to study! Keep up your progress.",
            icon: '/icons/icon-192x192.png',
            tag: 'daily-reminder',
          });
        }
      }
    };

    const interval = setInterval(checkReminder, 60000);
    return () => clearInterval(interval);
  }, [language]);

  // Handle opening video player
  const handleOpenVideoPlayer = useCallback((lesson: Lesson, courseId: string, levelId: string) => {
    setActiveVideoLesson({ lesson, courseId, levelId });
  }, []);

  // Handle completing lesson from video player
  const handleVideoComplete = useCallback(async (courseId: string, levelId: string, lessonId: string) => {
    const updated = await toggleLessonComplete(courseId, levelId, lessonId);
    if (updated) {
      useAppStore.getState().updateCourseInList(updated);
      const progress = await getAllProgress();
      useAppStore.getState().setProgress(progress);
    }
  }, []);

  // Handle closing video player
  const handleCloseVideoPlayer = useCallback(() => {
    setActiveVideoLesson(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg"
              style={{ backgroundColor: tc.primary }}
            >
              {language === 'ar' ? 'م' : 'M'}
            </div>
            <div
              className="absolute -inset-2 rounded-3xl animate-ping opacity-20"
              style={{ backgroundColor: tc.primary }}
            />
          </div>
          <div className="text-center">
            <p className="font-bold text-lg" style={{ color: tc.primary }}>
              {t('appName', language)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {language === 'ar' ? 'جاري التحميل...' : 'Loading...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="animate-fade-in">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'courses' && <CoursesList />}
        {currentView === 'course-details' && <CourseDetails />}
        {currentView === 'level-details' && <LevelDetails onOpenVideoPlayer={handleOpenVideoPlayer} />}
        {currentView === 'settings' && <Settings />}
      </div>
      <ImportModal />
      <YouTubeImport />

      {/* Video Player Overlay */}
      {activeVideoLesson && (
        <VideoPlayer
          lessonName={activeVideoLesson.lesson.name}
          lessonUrl={activeVideoLesson.lesson.url}
          lessonId={activeVideoLesson.lesson.id}
          courseId={activeVideoLesson.courseId}
          levelId={activeVideoLesson.levelId}
          onClose={handleCloseVideoPlayer}
          onComplete={handleVideoComplete}
        />
      )}
    </AppShell>
  );
}
