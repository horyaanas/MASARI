'use client';

import React from 'react';
import { useAppStore, themeColorMap, fontSizeMap } from '@/lib/store';
import { t } from '@/lib/i18n';
import { Home, BookOpen, Settings, Plus } from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentView, setCurrentView, language, fontSize, themeColor, isDarkMode, setImportModalOpen, setYouTubeImportOpen } = useAppStore();
  const lang = language;
  const isRTL = lang === 'ar';
  const tc = themeColorMap[themeColor];
  const fs = fontSizeMap[fontSize];

  return (
    <div
      className="flex flex-col min-h-screen bg-background text-foreground"
      style={{
        direction: isRTL ? 'rtl' : 'ltr',
        fontSize: fs.base,
        '--theme-primary': tc.primary,
        '--theme-primary-light': tc.primaryLight,
        '--theme-primary-dark': tc.primaryDark,
      } as React.CSSProperties}
    >
      {/* Top Bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-14 border-b bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm"
            style={{ backgroundColor: tc.primary }}
          >
            {lang === 'ar' ? 'م' : 'M'}
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight" style={{ color: tc.primary }}>
              {t('appName', lang)}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setYouTubeImportOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all active:scale-90 shadow-sm"
            style={{ backgroundColor: '#EF4444' }}
            aria-label={t('importFromYouTube', lang)}
            title={t('importFromYouTube', lang)}
          >
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          </button>
          <button
            onClick={() => setImportModalOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all active:scale-90 shadow-sm"
            style={{ backgroundColor: tc.primary }}
            aria-label={t('addCourse', lang)}
            title={t('importFromExcel', lang)}
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-accent transition-colors"
            aria-label={t('navSettings', lang)}
          >
            <Settings className="w-5 h-5" style={{ color: tc.primary }} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/80 border-t safe-bottom">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-6">
          <NavItem
            icon={<Home className="w-5 h-5" />}
            label={t('navHome', lang)}
            active={currentView === 'dashboard'}
            onClick={() => setCurrentView('dashboard')}
            primaryColor={tc.primary}
          />
          <div className="w-px h-6 bg-border" />
          <NavItem
            icon={<BookOpen className="w-5 h-5" />}
            label={t('navCourses', lang)}
            active={currentView === 'courses' || currentView === 'course-details' || currentView === 'level-details'}
            onClick={() => setCurrentView('courses')}
            primaryColor={tc.primary}
          />
        </div>
      </nav>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  primaryColor,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  primaryColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] h-full transition-all ${
        active ? 'opacity-100' : 'opacity-40 hover:opacity-60'
      }`}
    >
      <div className="relative">
        {icon}
        {active && (
          <div
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
            style={{ backgroundColor: primaryColor }}
          />
        )}
      </div>
      <span className={`text-[10px] font-medium ${active ? '' : ''}`} style={{ color: active ? primaryColor : undefined }}>
        {label}
      </span>
    </button>
  );
}
