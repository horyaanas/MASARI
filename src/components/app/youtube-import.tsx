'use client';

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useAppStore, themeColorMap } from '@/lib/store';
import { t } from '@/lib/i18n';
import { saveCourse, getAllProgress, updateCourse, Course, Level, Lesson } from '@/lib/db-indexeddb';
import {
  exportYouTubePlaylistToExcel,
  downloadBlob,
  sanitizeFilename,
} from '@/lib/excel';
import {
  X, Search, CheckCircle, AlertCircle, Loader2,
  Play, Clock, ChevronRight, ChevronLeft, BookOpen, Layers,
  Film, Settings, ExternalLink, Filter, ArrowDownUp, Download,
  Calendar, FileSpreadsheet, ListVideo,
} from 'lucide-react';
import { YouTubePlaylistPlayer, PlaylistPlayerVideo } from './youtube-playlist-player';

type YouTubeStep = 'url' | 'preview' | 'assignment' | 'importing';

type DurationFilter = 'all' | 'short' | 'medium' | 'long' | 'veryLong';
type DateFilter = 'all' | 'lastWeek' | 'lastMonth' | 'last3Months' | 'last6Months' | 'lastYear' | 'older';
type SortBy = 'position' | 'durationAsc' | 'durationDesc' | 'dateNewest' | 'dateOldest' | 'titleAsc' | 'titleDesc';

interface PlaylistVideo {
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

interface PlaylistInfo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  videoCount: number;
  videos: PlaylistVideo[];
}

function extractPlaylistId(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com') && parsed.searchParams.get('list')) {
      return parsed.searchParams.get('list');
    }
    if (parsed.hostname.includes('youtube.com') && parsed.pathname === '/watch' && parsed.searchParams.get('list')) {
      return parsed.searchParams.get('list');
    }
  } catch {
    // Not a valid URL
  }
  const match = url.match(/^[A-Za-z0-9_-]{10,40}$/);
  if (match) return url;
  const listMatch = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (listMatch) return listMatch[1];
  return null;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getDurationFilterRanges(): Record<DurationFilter, { min: number; max: number }> {
  return {
    all: { min: 0, max: Infinity },
    short: { min: 0, max: 5 },
    medium: { min: 5, max: 20 },
    long: { min: 20, max: 60 },
    veryLong: { min: 60, max: Infinity },
  };
}

function getDateFilterCutoff(dateFilter: DateFilter): number {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (dateFilter) {
    case 'lastWeek': return now - 7 * day;
    case 'lastMonth': return now - 30 * day;
    case 'last3Months': return now - 90 * day;
    case 'last6Months': return now - 180 * day;
    case 'lastYear': return now - 365 * day;
    case 'older': return 0; // Will be handled separately
    default: return 0;
  }
}

const YouTubeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

export function YouTubeImport() {
  const { isYouTubeImportOpen, setYouTubeImportOpen, language, themeColor, courses } = useAppStore();
  const lang = language;
  const isRTL = lang === 'ar';
  const tc = themeColorMap[themeColor];

  const [step, setStep] = useState<YouTubeStep>('url');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistData, setPlaylistData] = useState<PlaylistInfo | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [courseName, setCourseName] = useState('');
  const [courseType, setCourseType] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<'new' | 'existing'>('new');
  const [selectedExistingCourseId, setSelectedExistingCourseId] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('position');
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportErrorMessage, setExportErrorMessage] = useState('');
  const [showPlaylistPlayer, setShowPlaylistPlayer] = useState(false);
  const [playerVideos, setPlayerVideos] = useState<PlaylistPlayerVideo[]>([]);
  const [playerStartIndex, setPlayerStartIndex] = useState(0);
  const [playMode, setPlayMode] = useState<'filtered' | 'selected'>('filtered');

  const urlInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('url');
    setPlaylistUrl('');
    setPlaylistData(null);
    setSelectedVideos(new Set());
    setCourseName('');
    setCourseType('');
    setAssignmentMode('new');
    setSelectedExistingCourseId('');
    setIsFetching(false);
    setFetchError('');
    setImportSuccess(false);
    setImportError('');
    setIsImporting(false);
    setShowApiKeyInput(false);
    setShowFilters(false);
    setDurationFilter('all');
    setDateFilter('all');
    setSortBy('position');
    setExportSuccess(false);
    setExportErrorMessage('');
    setShowPlaylistPlayer(false);
    setPlayerVideos([]);
    setPlayerStartIndex(0);
    setPlayMode('filtered');
  }, []);

  const handleClose = useCallback(() => {
    setYouTubeImportOpen(false);
    reset();
  }, [setYouTubeImportOpen, reset]);

  const handleFetchPlaylist = useCallback(async () => {
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
      setFetchError(t('invalidPlaylistUrl', lang));
      return;
    }

    setIsFetching(true);
    setFetchError('');

    try {
      const { getSetting } = await import('@/lib/db-indexeddb');
      const savedApiKey = await getSetting('youtube_api_key');
      const effectiveApiKey = apiKey || savedApiKey || '';

      const params = new URLSearchParams({ list: playlistId });
      if (effectiveApiKey) params.set('apiKey', effectiveApiKey);

      const res = await fetch(`/api/youtube/playlist?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'no_api_key') {
          setShowApiKeyInput(true);
          setFetchError(lang === 'ar'
            ? 'مطلوب مفتاح YouTube API. أدخله أدناه أو أضفه من الإعدادات.'
            : 'YouTube API key is required. Enter it below or add it from Settings.');
        } else if (data.error === 'invalid_api_key') {
          setFetchError(t('invalidApiKey', lang));
        } else if (data.error === 'playlist_not_found') {
          setFetchError(t('playlistNotFound', lang));
        } else {
          setFetchError(data.message || t('error', lang));
        }
        return;
      }

      setPlaylistData(data);
      setSelectedVideos(new Set(data.videos.map((_: PlaylistVideo, i: number) => i)));
      setCourseName(data.title);
      setCourseType(lang === 'ar' ? 'يوتيوب' : 'YouTube');
      setStep('preview');

      if (apiKey) {
        await (await import('@/lib/db-indexeddb')).setSetting('youtube_api_key', apiKey);
      }
    } catch {
      setFetchError(lang === 'ar' ? 'فشل الاتصال بالخادم. تأكد من اتصالك بالإنترنت.' : 'Failed to connect to server. Check your internet connection.');
    } finally {
      setIsFetching(false);
    }
  }, [playlistUrl, apiKey, lang]);

  // Filtered & sorted videos
  const filteredVideos = useMemo(() => {
    if (!playlistData) return [];

    const durationRanges = getDurationFilterRanges();
    const dateCutoff = getDateFilterCutoff(dateFilter);
    const now = Date.now();

    const filtered = playlistData.videos.filter((video, originalIndex) => {
      // Duration filter
      const range = durationRanges[durationFilter];
      if (video.durationMinutes < range.min || video.durationMinutes > range.max) return false;

      // Date filter
      if (dateFilter !== 'all') {
        const videoDate = video.publishedAt ? new Date(video.publishedAt).getTime() : 0;
        if (dateFilter === 'older') {
          // older than 1 year
          if (videoDate > now - 365 * 24 * 60 * 60 * 1000) return false;
        } else {
          if (videoDate < dateCutoff) return false;
        }
      }

      return true;
    });

    // Sort
    const sorted = [...filtered];
    switch (sortBy) {
      case 'durationAsc':
        sorted.sort((a, b) => a.durationSeconds - b.durationSeconds);
        break;
      case 'durationDesc':
        sorted.sort((a, b) => b.durationSeconds - a.durationSeconds);
        break;
      case 'dateNewest':
        sorted.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
        break;
      case 'dateOldest':
        sorted.sort((a, b) => new Date(a.publishedAt || 0).getTime() - new Date(b.publishedAt || 0).getTime());
        break;
      case 'titleAsc':
        sorted.sort((a, b) => a.title.localeCompare(b.title, lang));
        break;
      case 'titleDesc':
        sorted.sort((a, b) => b.title.localeCompare(a.title, lang));
        break;
      case 'position':
      default:
        sorted.sort((a, b) => a.position - b.position);
        break;
    }

    return sorted;
  }, [playlistData, durationFilter, dateFilter, sortBy, lang]);

  // When filter changes, reselect all filtered videos
  const filteredVideoIds = useMemo(() => {
    return new Set(filteredVideos.map((v) => v.videoId));
  }, [filteredVideos]);

  const toggleVideoSelection = (videoId: string) => {
    setSelectedVideos((prev) => {
      const next = new Set(prev);
      // We store videoIds instead of indices to be filter-stable
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  // Initialize selectedVideos with videoIds when playlist loads
  const initSelectionFromPlaylist = useCallback((data: PlaylistInfo) => {
    setSelectedVideos(new Set(data.videos.map((v) => v.videoId)));
  }, []);

  // Re-run when playlistData changes
  React.useEffect(() => {
    if (playlistData) {
      initSelectionFromPlaylist(playlistData);
    }
  }, [playlistData, initSelectionFromPlaylist]);

  const toggleAllFiltered = () => {
    // If all filtered videos are selected, deselect them; otherwise select all filtered
    const allSelected = filteredVideos.every((v) => selectedVideos.has(v.videoId));
    if (allSelected) {
      setSelectedVideos((prev) => {
        const next = new Set(prev);
        filteredVideos.forEach((v) => next.delete(v.videoId));
        return next;
      });
    } else {
      setSelectedVideos((prev) => {
        const next = new Set(prev);
        filteredVideos.forEach((v) => next.add(v.videoId));
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    setSelectedVideos(new Set(filteredVideos.map((v) => v.videoId)));
  };

  const clearFilters = () => {
    setDurationFilter('all');
    setDateFilter('all');
    setSortBy('position');
  };

  // Play filtered (or selected) videos in sequence
  const handlePlayFiltered = useCallback((mode: 'filtered' | 'selected', startIndex?: number) => {
    if (!playlistData) return;

    const videosToPlay = mode === 'filtered'
      ? filteredVideos
      : filteredVideos.filter((v) => selectedVideos.has(v.videoId));

    if (videosToPlay.length === 0) {
      setExportErrorMessage(t('noVideosToPlay', lang));
      setTimeout(() => setExportErrorMessage(''), 3000);
      return;
    }

    // Convert to PlaylistPlayerVideo shape
    const playerVids: PlaylistPlayerVideo[] = videosToPlay.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail,
      duration: v.duration,
      durationSeconds: v.durationSeconds,
      position: v.position,
      channelTitle: v.channelTitle,
      publishedAt: v.publishedAt,
    }));

    setPlayerVideos(playerVids);
    setPlayMode(mode);
    setPlayerStartIndex(startIndex !== undefined ? Math.min(startIndex, playerVids.length - 1) : 0);
    setShowPlaylistPlayer(true);
  }, [playlistData, filteredVideos, selectedVideos, lang]);

  // Play a single video from the list
  const handlePlaySingle = useCallback((video: PlaylistVideo) => {
    if (!playlistData) return;

    // Find the video's position in the filtered list (to play in sequence from there)
    const idxInFiltered = filteredVideos.findIndex((v) => v.videoId === video.videoId);
    if (idxInFiltered !== -1) {
      handlePlayFiltered('filtered', idxInFiltered);
    } else {
      // Video not in filtered list - play just this one
      const playerVids: PlaylistPlayerVideo[] = [{
        videoId: video.videoId,
        title: video.title,
        thumbnail: video.thumbnail,
        duration: video.duration,
        durationSeconds: video.durationSeconds,
        position: video.position,
        channelTitle: video.channelTitle,
        publishedAt: video.publishedAt,
      }];
      setPlayerVideos(playerVids);
      setPlayMode('filtered');
      setPlayerStartIndex(0);
      setShowPlaylistPlayer(true);
    }
  }, [playlistData, filteredVideos, handlePlayFiltered]);

  // Export to Excel
  const handleExport = useCallback((exportAll: boolean) => {
    if (!playlistData) return;
    setExportErrorMessage('');

    try {
      const videosToExport = exportAll
        ? playlistData.videos
        : filteredVideos.filter((v) => selectedVideos.has(v.videoId));

      if (videosToExport.length === 0) {
        setExportErrorMessage(lang === 'ar' ? 'لا توجد فيديوهات للتصدير' : 'No videos to export');
        return;
      }

      const blob = exportYouTubePlaylistToExcel(playlistData, {
        videos: videosToExport,
        courseName,
        courseType,
      });

      const filename = `${sanitizeFilename(courseName || playlistData.title)}.xlsx`;
      downloadBlob(blob, filename);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 2500);
    } catch (err) {
      console.error('Export error:', err);
      setExportErrorMessage(t('exportError', lang));
    }
  }, [playlistData, filteredVideos, selectedVideos, courseName, courseType, lang]);

  const handleImport = useCallback(async () => {
    if (!playlistData || isImporting) return;
    setIsImporting(true);
    setImportError('');

    try {
      // Use filtered & sorted videos that are also selected
      const selectedVideoList = filteredVideos.filter((v) => selectedVideos.has(v.videoId));
      if (selectedVideoList.length === 0) {
        setImportError(lang === 'ar' ? 'اختر فيديو واحد على الأقل' : 'Select at least one video');
        setIsImporting(false);
        return;
      }

      const lessons: Lesson[] = selectedVideoList.map((video, idx) => ({
        id: generateId(),
        levelId: '',
        courseId: '',
        name: video.title,
        url: `https://www.youtube.com/watch?v=${video.videoId}`,
        duration: video.duration,
        order: idx,
        completed: false,
        thumbnail: video.thumbnail,
        videoId: video.videoId,
        durationSeconds: video.durationSeconds,
        publishedAt: video.publishedAt,
        addedToPlaylistAt: video.addedToPlaylistAt,
        channelTitle: video.channelTitle,
      }));

      if (assignmentMode === 'new') {
        const courseId = generateId();
        const levelId = generateId();

        lessons.forEach((l) => {
          l.courseId = courseId;
          l.levelId = levelId;
        });

        const course: Course = {
          id: courseId,
          name: courseName || playlistData.title,
          type: courseType || (lang === 'ar' ? 'يوتيوب' : 'YouTube'),
          levels: [{
            id: levelId,
            courseId,
            name: lang === 'ar' ? 'المستوى الأول' : 'Level 1',
            order: 0,
            lessons,
          }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          thumbnail: playlistData.thumbnail,
          sourceType: 'youtube',
          sourceUrl: `https://www.youtube.com/playlist?list=${playlistData.id}`,
          channelTitle: playlistData.channelTitle,
        };

        await saveCourse(course);
        useAppStore.getState().addCourseToList(course);
      } else if (assignmentMode === 'existing') {
        const existingCourse = courses.find((c) => c.id === selectedExistingCourseId);
        if (!existingCourse) throw new Error('Course not found');

        const levelId = generateId();
        lessons.forEach((l) => {
          l.courseId = existingCourse.id;
          l.levelId = levelId;
        });

        const newLevel: Level = {
          id: levelId,
          courseId: existingCourse.id,
          name: courseName || playlistData.title,
          order: existingCourse.levels.length,
          lessons,
        };

        const updatedLevels = [...existingCourse.levels, newLevel];
        const updated: Course = {
          ...existingCourse,
          levels: updatedLevels,
          updatedAt: Date.now(),
        };

        await updateCourse(updated);
        useAppStore.getState().updateCourseInList(updated);
      }

      const progress = await getAllProgress();
      useAppStore.getState().setProgress(progress);

      setImportSuccess(true);
      setTimeout(handleClose, 2000);
    } catch {
      setImportError(t('importError', lang));
    } finally {
      setIsImporting(false);
    }
  }, [playlistData, filteredVideos, selectedVideos, assignmentMode, courseName, courseType, courses, selectedExistingCourseId, isImporting, lang, handleClose]);

  if (!isYouTubeImportOpen) return null;

  const NextArrow = isRTL ? ChevronLeft : ChevronRight;
  const selectedFilteredVideos = filteredVideos.filter((v) => selectedVideos.has(v.videoId));
  const totalSelectedDuration = selectedFilteredVideos.reduce((sum, v) => sum + v.durationMinutes, 0);
  const totalFilteredDuration = filteredVideos.reduce((sum, v) => sum + v.durationMinutes, 0);

  const steps: { key: YouTubeStep; label: string }[] = [
    { key: 'url', label: t('youtubePlaylistUrl', lang) },
    { key: 'preview', label: t('selectVideosToImport', lang) },
    { key: 'assignment', label: t('courseName', lang) },
    { key: 'importing', label: t('import', lang) },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  const hasActiveFilters = durationFilter !== 'all' || dateFilter !== 'all' || sortBy !== 'position';

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-lg bg-background rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-fade-in">
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ background: `linear-gradient(135deg, #FF000015, #FF000008)` }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500 text-white">
              <YouTubeIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">{t('importFromYouTube', lang)}</h2>
              <p className="text-[10px] text-muted-foreground">{t('importYouTubeDesc', lang)}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps Indicator */}
        {(step !== 'importing' || importSuccess) && (
          <div className="flex items-center px-4 py-2.5 border-b gap-1">
            {steps.filter((s) => s.key !== 'importing').map((s, i) => (
              <React.Fragment key={s.key}>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all"
                    style={{
                      backgroundColor: i <= currentStepIndex ? '#EF4444' : 'var(--muted)',
                      color: i <= currentStepIndex ? 'white' : 'var(--muted-foreground)',
                    }}
                  >
                    {i < currentStepIndex ? <CheckCircle className="w-3 h-3" /> : i + 1}
                  </div>
                  <span className={`text-[9px] whitespace-nowrap hidden sm:block ${i <= currentStepIndex ? 'font-medium' : 'text-muted-foreground'}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 2 && (
                  <div className="flex-1 h-0.5 rounded-full mx-1" style={{ backgroundColor: i < currentStepIndex ? '#EF4444' : 'var(--muted)' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Errors */}
          {fetchError && (
            <div className="mb-4 p-3 rounded-xl bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {fetchError}
            </div>
          )}
          {importError && (
            <div className="mb-4 p-3 rounded-xl bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {importError}
            </div>
          )}
          {exportErrorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {exportErrorMessage}
            </div>
          )}
          {exportSuccess && (
            <div className="mb-4 p-3 rounded-xl bg-green-500/10 text-green-600 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              {t('exportSuccess', lang)}
            </div>
          )}

          {/* Success */}
          {importSuccess && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4 bg-green-500/10">
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
              <p className="font-bold text-lg text-green-600">{t('importSuccess', lang)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedFilteredVideos.length} {lang === 'ar' ? 'فيديو' : 'videos'}
              </p>
            </div>
          )}

          {/* STEP 1: URL Input */}
          {!importSuccess && step === 'url' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">{t('youtubePlaylistUrl', lang)}</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <YouTubeIcon className="absolute top-1/2 -translate-y-1/2 start-3 w-5 h-5 text-red-500" />
                    <input
                      ref={urlInputRef}
                      type="url"
                      value={playlistUrl}
                      onChange={(e) => { setPlaylistUrl(e.target.value); setFetchError(''); }}
                      className="w-full h-12 rounded-xl border bg-background ps-10 pe-4 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': '#EF4444' } as React.CSSProperties}
                      placeholder={t('pastePlaylistUrl', lang)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFetchPlaylist()}
                    />
                  </div>
                  <button
                    onClick={handleFetchPlaylist}
                    disabled={!playlistUrl.trim() || isFetching}
                    className="px-4 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-all active:scale-95 disabled:opacity-40 flex items-center gap-2 shadow-md"
                  >
                    {isFetching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                  {lang === 'ar'
                    ? 'مثال: https://youtube.com/playlist?list=PLxxxxxx'
                    : 'Example: https://youtube.com/playlist?list=PLxxxxxx'}
                </p>
              </div>

              {/* API Key Section */}
              <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: `${tc.primary}30` }}>
                <button
                  className="w-full flex items-center justify-between"
                  onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                >
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4" style={{ color: tc.primary }} />
                    <span className="text-sm font-medium">{t('youtubeApiKey', lang)}</span>
                  </div>
                  {showApiKeyInput ? (
                    <ChevronRight className="w-4 h-4 rotate-90" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                {showApiKeyInput && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-[10px] text-muted-foreground">{t('youtubeApiKeyDesc', lang)}</p>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full h-9 rounded-lg border bg-background px-3 text-xs focus:outline-none focus:ring-1"
                      style={{ '--tw-ring-color': tc.primary } as React.CSSProperties}
                      placeholder={t('youtubeApiKeyPlaceholder', lang)}
                    />
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-medium flex items-center gap-1 hover:underline"
                      style={{ color: tc.primary }}
                    >
                      <ExternalLink className="w-3 h-3" />
                      {t('howToGetApiKey', lang)}
                    </a>
                  </div>
                )}
              </div>

              {isFetching && (
                <div className="flex flex-col items-center py-8">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-red-500/10 mb-4">
                      <YouTubeIcon className="w-8 h-8 text-red-500" />
                    </div>
                    <div className="absolute -inset-2 rounded-3xl animate-ping opacity-20 bg-red-500" />
                  </div>
                  <p className="text-sm font-medium">{t('fetchingPlaylist', lang)}</p>
                  <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden mt-3">
                    <div className="h-full bg-red-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Preview & Filter & Select Videos */}
          {!importSuccess && !isImporting && step === 'preview' && playlistData && (
            <div className="space-y-4">
              {/* Playlist Info Card */}
              <div className="rounded-2xl border overflow-hidden shadow-sm">
                {playlistData.thumbnail && (
                  <div className="relative h-32 overflow-hidden">
                    <img src={playlistData.thumbnail} alt={playlistData.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h3 className="text-white font-bold text-sm truncate">{playlistData.title}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        {playlistData.channelTitle && (
                          <span className="text-white/80 text-[10px] flex items-center gap-1">
                            <Film className="w-3 h-3" />
                            {playlistData.channelTitle}
                          </span>
                        )}
                        <span className="text-white/80 text-[10px]">
                          {playlistData.videoCount} {t('videos', lang)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {!playlistData.thumbnail && (
                  <div className="h-20 flex items-center justify-center bg-red-500/10">
                    <YouTubeIcon className="w-10 h-10 text-red-500" />
                  </div>
                )}
              </div>

              {/* Filter Bar */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                    hasActiveFilters || showFilters
                      ? 'border-red-400 bg-red-50 dark:bg-red-950/20 text-red-600'
                      : 'hover:bg-accent'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {t('filterVideos', lang)}
                  {hasActiveFilters && (
                    <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center">
                      !
                    </span>
                  )}
                </button>
                <button
                  onClick={() => handleExport(false)}
                  disabled={selectedFilteredVideos.length === 0}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium hover:bg-accent transition-colors disabled:opacity-40"
                  style={{ color: '#16a34a', borderColor: '#16a34a40' }}
                  title={t('exportFiltered', lang)}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('exportFiltered', lang)}</span>
                </button>
                <button
                  onClick={() => handleExport(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium hover:bg-accent transition-colors"
                  style={{ color: '#16a34a', borderColor: '#16a34a40' }}
                  title={t('exportAll', lang)}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('exportAll', lang)}</span>
                </button>
              </div>

              {/* Play buttons row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePlayFiltered('filtered')}
                  disabled={filteredVideos.length === 0}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-40 shadow-sm"
                  style={{ background: 'linear-gradient(135deg, #FF0000, #CC0000)' }}
                  title={t('playAllFiltered', lang)}
                >
                  <Play className="w-3.5 h-3.5" />
                  {t('playAllFiltered', lang)}
                  <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[9px]">
                    {filteredVideos.length}
                  </span>
                </button>
                <button
                  onClick={() => handlePlayFiltered('selected')}
                  disabled={selectedFilteredVideos.length === 0}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all hover:bg-accent disabled:opacity-40"
                  style={{ color: '#EF4444', borderColor: '#EF444440' }}
                  title={t('playSelectedOnly', lang)}
                >
                  <ListVideo className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('playSelectedOnly', lang)}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-[9px]">
                    {selectedFilteredVideos.length}
                  </span>
                </button>
              </div>

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
                        { val: 'all' as const, label: t('allDurations', lang) },
                        { val: 'short' as const, label: t('shortVideos', lang) },
                        { val: 'medium' as const, label: t('mediumVideos', lang) },
                        { val: 'long' as const, label: t('longVideos', lang) },
                        { val: 'veryLong' as const, label: t('veryLongVideos', lang) },
                      ]).map((opt) => (
                        <button
                          key={opt.val}
                          onClick={() => setDurationFilter(opt.val)}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                            durationFilter === opt.val
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
                        { val: 'all' as const, label: t('allDates', lang) },
                        { val: 'lastWeek' as const, label: t('lastWeek', lang) },
                        { val: 'lastMonth' as const, label: t('lastMonth', lang) },
                        { val: 'last3Months' as const, label: t('last3Months', lang) },
                        { val: 'last6Months' as const, label: t('last6Months', lang) },
                        { val: 'lastYear' as const, label: t('lastYear', lang) },
                        { val: 'older' as const, label: t('older', lang) },
                      ]).map((opt) => (
                        <button
                          key={opt.val}
                          onClick={() => setDateFilter(opt.val)}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                            dateFilter === opt.val
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
                      <ArrowDownUp className="w-3 h-3" />
                      {t('sortBy', lang)}
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortBy)}
                      className="w-full h-8 rounded-lg border bg-background px-2 text-xs focus:outline-none focus:ring-1"
                      style={{ '--tw-ring-color': '#EF4444' } as React.CSSProperties}
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

                  {/* Clear Filters */}
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="w-full py-1.5 rounded-lg border text-[10px] font-medium hover:bg-accent transition-colors text-destructive border-destructive/30"
                    >
                      {t('clearFilters', lang)}
                    </button>
                  )}
                </div>
              )}

              {/* Filtered results count & duration */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 font-medium">
                  {t('filterResults', lang)}: {filteredVideos.length}/{playlistData.videos.length}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 font-medium">
                  {selectedFilteredVideos.length} {t('selectedVideos', lang)}
                </span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {t('totalDuration', lang)}: {totalFilteredDuration >= 60 ? `${Math.floor(totalFilteredDuration / 60)} ${t('hours', lang)} ` : ''}{totalFilteredDuration % 60} {t('minutes', lang)}
                </span>
              </div>

              {/* Select All Filtered / Deselect */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Play className="w-4 h-4 text-red-500" />
                  {t('selectVideosToImport', lang)}
                </h3>
                <div className="flex gap-1.5">
                  <button
                    onClick={selectAllFiltered}
                    className="text-[10px] font-medium px-2.5 py-1 rounded-lg border hover:bg-accent transition-colors"
                    style={{ color: '#EF4444', borderColor: '#EF444430' }}
                  >
                    {t('importAllVideos', lang)}
                  </button>
                  <button
                    onClick={toggleAllFiltered}
                    className="text-[10px] font-medium px-2.5 py-1 rounded-lg border hover:bg-accent transition-colors"
                    style={{ color: tc.primary, borderColor: `${tc.primary}30` }}
                  >
                    {filteredVideos.every((v) => selectedVideos.has(v.videoId)) && filteredVideos.length > 0
                      ? (lang === 'ar' ? 'إلغاء الكل' : 'Deselect All')
                      : (lang === 'ar' ? 'تحديد الكل' : 'Select All')}
                  </button>
                </div>
              </div>

              {/* Video List - shows filtered & sorted */}
              {filteredVideos.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Filter className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  {t('noFilterResults', lang)}
                </div>
              ) : (
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                  {filteredVideos.map((video) => {
                    const isSelected = selectedVideos.has(video.videoId);
                    return (
                      <div
                        key={video.videoId}
                        className={`rounded-xl border overflow-hidden transition-all cursor-pointer ${
                          isSelected ? 'shadow-sm border-red-300 dark:border-red-900/50' : 'opacity-50'
                        }`}
                        style={isSelected ? { backgroundColor: '#EF444408' } : {}}
                        onClick={() => toggleVideoSelection(video.videoId)}
                      >
                        <div className="flex items-start gap-2.5 p-2.5">
                          <div
                            className="w-5 h-5 rounded flex items-center justify-center border-2 transition-colors flex-shrink-0 mt-1"
                            style={{
                              borderColor: isSelected ? '#EF4444' : 'var(--muted-foreground)',
                              backgroundColor: isSelected ? '#EF4444' : 'transparent',
                            }}
                          >
                            {isSelected && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                          </div>

                          {video.thumbnail && (
                            <div className="relative w-20 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-muted group/thumb">
                              <img
                                src={video.thumbnail}
                                alt={video.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute bottom-0.5 end-0.5 bg-black/80 text-white text-[8px] px-1 py-0.5 rounded">
                                {video.duration}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePlaySingle(video);
                                }}
                                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                title={t('playFiltered', lang)}
                              >
                                <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center">
                                  <Play className="w-3.5 h-3.5 text-white ms-0.5" />
                                </div>
                              </button>
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium leading-tight line-clamp-2">{video.title}</p>
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {video.duration}
                              </span>
                              <span>#{video.position + 1}</span>
                              {video.publishedAt && (
                                <span className="flex items-center gap-0.5">
                                  <Calendar className="w-2.5 h-2.5" />
                                  {new Date(video.publishedAt).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Import filtered notice */}
              {hasActiveFilters && selectedFilteredVideos.length > 0 && (
                <div className="p-3 rounded-xl border text-[11px]" style={{ backgroundColor: '#3B82F608', borderColor: '#3B82F630' }}>
                  <p className="font-medium text-blue-600 flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    {t('importFiltered', lang)}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    {selectedFilteredVideos.length} {lang === 'ar' ? 'فيديو سيتم استيرادها' : 'videos will be imported'} ({lang === 'ar' ? 'مرتبة حسب' : 'sorted by'} {t(`sortBy${sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}`, lang)})
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Course Assignment */}
          {!importSuccess && !isImporting && step === 'assignment' && playlistData && (
            <div className="space-y-4">
              <div className="space-y-2">
                {[
                  { mode: 'new' as const, icon: <BookOpen className="w-4 h-4" />, label: t('createNewCourse', lang) },
                  { mode: 'existing' as const, icon: <Layers className="w-4 h-4" />, label: t('addAsNewLevels', lang) },
                ].map((opt) => (
                  <button
                    key={opt.mode}
                    onClick={() => setAssignmentMode(opt.mode)}
                    className={`w-full p-3 rounded-xl border text-sm text-start transition-all flex items-center gap-3 ${
                      assignmentMode === opt.mode ? 'shadow-md' : 'hover:bg-accent'
                    }`}
                    style={assignmentMode === opt.mode ? { borderColor: '#EF4444', backgroundColor: '#EF444408' } : {}}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: assignmentMode === opt.mode ? '#EF4444' : 'var(--muted)', color: assignmentMode === opt.mode ? 'white' : 'var(--muted-foreground)' }}
                    >
                      {opt.icon}
                    </div>
                    <span className="font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>

              {assignmentMode === 'new' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">{t('courseName', lang)}</label>
                    <input
                      type="text"
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      className="w-full h-11 rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': '#EF4444' } as React.CSSProperties}
                      placeholder={lang === 'ar' ? 'أدخل اسم الدورة' : 'Enter course name'}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">{t('courseTypeLabel', lang)}</label>
                    <input
                      type="text"
                      value={courseType}
                      onChange={(e) => setCourseType(e.target.value)}
                      className="w-full h-11 rounded-xl border bg-background px-4 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': '#EF4444' } as React.CSSProperties}
                      placeholder={lang === 'ar' ? 'مثال: برمجة، تصميم...' : 'e.g., Programming, Design...'}
                    />
                  </div>
                </div>
              )}

              {assignmentMode === 'existing' && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">{lang === 'ar' ? 'اختر الدورة' : 'Select Course'}</label>
                  {courses.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">{t('noCourses', lang)}</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {courses.map((course) => (
                        <button
                          key={course.id}
                          onClick={() => setSelectedExistingCourseId(course.id)}
                          className={`w-full p-3 rounded-xl border text-sm text-start transition-all ${
                            selectedExistingCourseId === course.id ? 'shadow-md' : 'hover:bg-accent'
                          }`}
                          style={selectedExistingCourseId === course.id ? { borderColor: '#EF4444', backgroundColor: '#EF444408' } : {}}
                        >
                          <p className="font-medium">{course.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {course.levels.length} {t('levels', lang)} • {course.type || (lang === 'ar' ? 'بدون تصنيف' : 'No type')}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="p-3 rounded-xl border text-xs" style={{ backgroundColor: '#EF444408', borderColor: '#EF444430' }}>
                <p className="font-medium text-red-600">
                  {lang === 'ar' ? 'ملخص الاستيراد' : 'Import Summary'}
                </p>
                <p className="text-muted-foreground mt-1">
                  {selectedFilteredVideos.length} {lang === 'ar' ? 'فيديو' : 'videos'} • {t('totalDuration', lang)}: {totalSelectedDuration >= 60 ? `${Math.floor(totalSelectedDuration / 60)} ${t('hours', lang)} ` : ''}{totalSelectedDuration % 60} {t('minutes', lang)}
                </p>
                {hasActiveFilters && (
                  <p className="text-[10px] text-blue-600 mt-1 flex items-center gap-1">
                    <Filter className="w-2.5 h-2.5" />
                    {t('importFiltered', lang)}
                  </p>
                )}
              </div>
            </div>
          )}

          {isImporting && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-4 rounded-full animate-spin mb-4" style={{ borderColor: '#EF444430', borderTopColor: '#EF4444' }} />
              <p className="text-sm text-muted-foreground font-medium">{t('importing', lang)}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!importSuccess && !isImporting && (
          <div className="p-4 border-t flex items-center justify-between gap-3 bg-background">
            {step !== 'url' ? (
              <button
                onClick={() => {
                  const prevSteps: Record<YouTubeStep, YouTubeStep> = {
                    url: 'url',
                    preview: 'url',
                    assignment: 'preview',
                    importing: 'assignment',
                  };
                  setStep(prevSteps[step]);
                }}
                className="px-5 py-2.5 rounded-xl text-sm border hover:bg-accent transition-colors"
              >
                {t('back', lang)}
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={() => {
                if (step === 'url') {
                  handleFetchPlaylist();
                } else if (step === 'preview') {
                  if (selectedFilteredVideos.length === 0) return;
                  setStep('assignment');
                } else if (step === 'assignment') {
                  if (assignmentMode === 'new' && !courseName.trim()) return;
                  if (assignmentMode === 'existing' && !selectedExistingCourseId) return;
                  handleImport();
                }
              }}
              disabled={
                (step === 'url' && !playlistUrl.trim()) ||
                (step === 'preview' && selectedFilteredVideos.length === 0) ||
                (step === 'assignment' && ((assignmentMode === 'new' && !courseName.trim()) || (assignmentMode === 'existing' && !selectedExistingCourseId)))
              }
              className="px-6 py-2.5 rounded-xl text-white text-sm font-medium transition-all active:scale-95 disabled:opacity-40 shadow-md flex items-center gap-1.5 bg-red-500 hover:bg-red-600"
            >
              {step === 'url'
                ? t('fetchPlaylist', lang)
                : step === 'assignment'
                  ? t('import', lang)
                  : lang === 'ar' ? 'التالي' : 'Next'
              }
              {step !== 'assignment' && <NextArrow className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* Playlist Player - rendered as a portal-like overlay above the import modal */}
      {showPlaylistPlayer && playlistData && playerVideos.length > 0 && (
        <YouTubePlaylistPlayer
          videos={playerVideos}
          playlist={{
            id: playlistData.id,
            title: playMode === 'selected'
              ? `${playlistData.title} - ${t('selectedVideos', lang)}`
              : `${playlistData.title} - ${t('filterResults', lang)}`,
            thumbnail: playlistData.thumbnail,
            channelTitle: playlistData.channelTitle,
          }}
          startIndex={playerStartIndex}
          onClose={() => {
            setShowPlaylistPlayer(false);
            setPlayerVideos([]);
          }}
        />
      )}
    </div>
  );
}
