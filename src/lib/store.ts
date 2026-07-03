import { create } from 'zustand';
import { Course, Level, Lesson, Progress } from './db-indexeddb';
import { Language } from './i18n';

export type AppView = 'dashboard' | 'courses' | 'course-details' | 'level-details' | 'settings';
export type FontSize = 'small' | 'medium' | 'large';
export type ThemeColor = 'emerald' | 'teal' | 'cyan' | 'amber' | 'rose' | 'violet';

interface AppState {
  // Navigation
  currentView: AppView;
  selectedCourseId: string | null;
  selectedLevelId: string | null;
  setCurrentView: (view: AppView) => void;
  selectCourse: (courseId: string) => void;
  selectLevel: (levelId: string) => void;
  goBack: () => void;

  // View history for back navigation
  viewHistory: AppView[];

  // Courses data
  courses: Course[];
  progressMap: Record<string, Progress>;
  setCourses: (courses: Course[]) => void;
  setProgress: (progress: Progress[]) => void;
  updateCourseInList: (course: Course) => void;
  removeCourseFromList: (courseId: string) => void;
  addCourseToList: (course: Course) => void;

  // Settings
  language: Language;
  fontSize: FontSize;
  themeColor: ThemeColor;
  isDarkMode: boolean;
  notificationsEnabled: boolean;
  reminderTime: string;
  setLanguage: (lang: Language) => void;
  setFontSize: (size: FontSize) => void;
  setThemeColor: (color: ThemeColor) => void;
  setIsDarkMode: (dark: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setReminderTime: (time: string) => void;

  // Import modal
  isImportModalOpen: boolean;
  setImportModalOpen: (open: boolean) => void;

  // YouTube import modal
  isYouTubeImportOpen: boolean;
  setYouTubeImportOpen: (open: boolean) => void;

  // Delete confirmation
  deleteConfirmId: string | null;
  setDeleteConfirmId: (id: string | null) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Loading
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  currentView: 'dashboard',
  selectedCourseId: null,
  selectedLevelId: null,
  viewHistory: [],
  setCurrentView: (view) => {
    const { currentView, viewHistory } = get();
    set({
      currentView: view,
      viewHistory: [...viewHistory, currentView],
      selectedCourseId: view === 'course-details' ? get().selectedCourseId : null,
      selectedLevelId: view === 'level-details' ? get().selectedLevelId : null,
    });
  },
  selectCourse: (courseId) => {
    const { currentView, viewHistory } = get();
    set({
      currentView: 'course-details',
      selectedCourseId: courseId,
      selectedLevelId: null,
      viewHistory: [...viewHistory, currentView],
    });
  },
  selectLevel: (levelId) => {
    const { currentView, viewHistory } = get();
    set({
      currentView: 'level-details',
      selectedLevelId: levelId,
      viewHistory: [...viewHistory, currentView],
    });
  },
  goBack: () => {
    const { viewHistory } = get();
    if (viewHistory.length > 0) {
      const newHistory = [...viewHistory];
      const prevView = newHistory.pop()!;
      set({
        currentView: prevView,
        viewHistory: newHistory,
        selectedCourseId: prevView === 'course-details' || prevView === 'level-details' ? get().selectedCourseId : null,
        selectedLevelId: prevView === 'level-details' ? get().selectedLevelId : null,
      });
    }
  },

  // Courses data
  courses: [],
  progressMap: {},
  setCourses: (courses) => set({ courses }),
  setProgress: (progress) => {
    const map: Record<string, Progress> = {};
    progress.forEach((p) => (map[p.courseId] = p));
    set({ progressMap: map });
  },
  updateCourseInList: (course) => {
    const { courses } = get();
    set({ courses: courses.map((c) => (c.id === course.id ? course : c)) });
  },
  removeCourseFromList: (courseId) => {
    const { courses, progressMap } = get();
    const newProgressMap = { ...progressMap };
    delete newProgressMap[courseId];
    set({ courses: courses.filter((c) => c.id !== courseId), progressMap: newProgressMap });
  },
  addCourseToList: (course) => {
    const { courses } = get();
    set({ courses: [course, ...courses] });
  },

  // Settings
  language: 'ar',
  fontSize: 'medium',
  themeColor: 'emerald',
  isDarkMode: false,
  notificationsEnabled: false,
  reminderTime: '09:00',
  setLanguage: (lang) => set({ language: lang }),
  setFontSize: (size) => set({ fontSize: size }),
  setThemeColor: (color) => set({ themeColor: color }),
  setIsDarkMode: (dark) => set({ isDarkMode: dark }),
  setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
  setReminderTime: (time) => set({ reminderTime: time }),

  // Import modal
  isImportModalOpen: false,
  setImportModalOpen: (open) => set({ isImportModalOpen: open }),

  // YouTube import modal
  isYouTubeImportOpen: false,
  setYouTubeImportOpen: (open) => set({ isYouTubeImportOpen: open }),

  // Delete confirmation
  deleteConfirmId: null,
  setDeleteConfirmId: (id) => set({ deleteConfirmId: id }),

  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Loading
  isLoading: true,
  setIsLoading: (loading) => set({ isLoading: loading }),
}));

export const themeColorMap: Record<ThemeColor, { primary: string; primaryLight: string; primaryDark: string; name: string; nameAr: string }> = {
  emerald: { primary: '#10b981', primaryLight: '#34d399', primaryDark: '#059669', name: 'Emerald', nameAr: 'زمردي' },
  teal: { primary: '#14b8a6', primaryLight: '#2dd4bf', primaryDark: '#0d9488', name: 'Teal', nameAr: 'تيل' },
  cyan: { primary: '#06b6d4', primaryLight: '#22d3ee', primaryDark: '#0891b2', name: 'Cyan', nameAr: 'سماوي' },
  amber: { primary: '#f59e0b', primaryLight: '#fbbf24', primaryDark: '#d97706', name: 'Amber', nameAr: 'كهرماني' },
  rose: { primary: '#f43f5e', primaryLight: '#fb7185', primaryDark: '#e11d48', name: 'Rose', nameAr: 'وردي' },
  violet: { primary: '#8b5cf6', primaryLight: '#a78bfa', primaryDark: '#7c3aed', name: 'Violet', nameAr: 'بنفسجي' },
};

export const fontSizeMap: Record<FontSize, { base: string; name: string; nameAr: string }> = {
  small: { base: '14px', name: 'Small', nameAr: 'صغير' },
  medium: { base: '16px', name: 'Medium', nameAr: 'متوسط' },
  large: { base: '18px', name: 'Large', nameAr: 'كبير' },
};
