'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore, themeColorMap } from '@/lib/store';
import { t, Language } from '@/lib/i18n';
import { X, CheckCircle2, Clock, Play } from 'lucide-react';

interface VideoPlayerProps {
  lessonName: string;
  lessonUrl: string;
  lessonId: string;
  courseId: string;
  levelId: string;
  onClose: () => void;
  onComplete: (courseId: string, levelId: string, lessonId: string) => Promise<void>;
}

// Extract YouTube video ID from various URL formats
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // youtube.com/watch?v=ID
    if (parsed.hostname.includes('youtube.com') && parsed.searchParams.get('v')) {
      return parsed.searchParams.get('v');
    }
    // youtu.be/ID
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    // youtube.com/embed/ID
    if (parsed.hostname.includes('youtube.com') && parsed.pathname.startsWith('/embed/')) {
      return parsed.pathname.split('/embed/')[1]?.split('/')[0] || null;
    }
    // youtube.com/shorts/ID
    if (parsed.hostname.includes('youtube.com') && parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/shorts/')[1]?.split('/')[0] || null;
    }
  } catch {
    // Try regex fallback
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }
  return null;
}

export function VideoPlayer({ lessonName, lessonUrl, lessonId, courseId, levelId, onClose, onComplete }: VideoPlayerProps) {
  const { language, themeColor } = useAppStore();
  const lang = language;
  const tc = themeColorMap[themeColor];

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [watchProgress, setWatchProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const youtubeId = extractYouTubeId(lessonUrl);
  const isYouTube = !!youtubeId;
  const canComplete = watchProgress >= 80;

  // Load YouTube IFrame API
  useEffect(() => {
    if (!isYouTube || !youtubeId) return;

    const onYouTubeIframeAPIReady = () => {
      if (playerRef.current) return;
      playerRef.current = new (window as any).YT.Player('yt-player', {
        videoId: youtubeId,
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          hl: lang === 'ar' ? 'ar' : 'en',
        },
        events: {
          onReady: () => {
            setIsPlayerReady(true);
          },
          onStateChange: (event: any) => {
            // Track when video ends
            if (event.data === 0) {
              setWatchProgress(100);
            }
          },
        },
      });
    };

    // Check if API is already loaded
    if ((window as any).YT && (window as any).YT.Player) {
      onYouTubeIframeAPIReady();
    } else {
      // Load the API script
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
      // Set callback
      (window as any).onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, [isYouTube, youtubeId, lang]);

  // Poll progress
  useEffect(() => {
    if (!isPlayerReady || !isYouTube) return;

    progressIntervalRef.current = setInterval(() => {
      try {
        const player = playerRef.current;
        if (player && player.getCurrentTime && player.getDuration) {
          const ct = player.getCurrentTime();
          const d = player.getDuration();
          if (d > 0) {
            const progress = Math.min(Math.round((ct / d) * 100), 100);
            setCurrentTime(ct);
            setDuration(d);
            setWatchProgress((prev) => Math.max(prev, progress));
          }
        }
      } catch {}
    }, 2000);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlayerReady, isYouTube]);

  const handleComplete = useCallback(async () => {
    if (!canComplete || isCompleting) return;
    setIsCompleting(true);
    try {
      await onComplete(courseId, levelId, lessonId);
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch {
      // Error handling
    } finally {
      setIsCompleting(false);
    }
  }, [canComplete, isCompleting, courseId, levelId, lessonId, onComplete, onClose]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm z-10">
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold text-sm truncate">{lessonName}</h2>
          {isYouTube && duration > 0 && (
            <p className="text-white/60 text-xs mt-0.5">
              {formatTime(currentTime)} / {formatTime(duration)}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors ms-3"
          title={t('closePlayer', lang)}
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Video area */}
      <div className="flex-1 flex items-center justify-center bg-black relative">
        {isYouTube ? (
          <div ref={playerContainerRef} className="w-full max-w-3xl aspect-video">
            <div id="yt-player" className="w-full h-full" />
          </div>
        ) : (
          <div className="text-center px-6">
            <div
              className="w-24 h-24 rounded-2xl mx-auto mb-6 flex items-center justify-center"
              style={{ backgroundColor: `${tc.primary}20` }}
            >
              <Play className="w-12 h-12" style={{ color: tc.primary }} />
            </div>
            <p className="text-white/80 text-sm mb-4">
              {lang === 'ar' ? 'هذا الدرس لا يحتوي على فيديو يوتيوب' : 'This lesson does not have a YouTube video'}
            </p>
            {lessonUrl && (
              <a
                href={lessonUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-medium"
                style={{ backgroundColor: tc.primary }}
              >
                {lang === 'ar' ? 'فتح الرابط الخارجي' : 'Open External Link'}
              </a>
            )}
          </div>
        )}

        {/* Success overlay */}
        {showSuccess && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20 animate-fade-in">
            <div className="text-center">
              <CheckCircle2 className="w-20 h-20 text-green-400 mx-auto mb-4" />
              <p className="text-white font-bold text-xl">{t('lessonCompleted', lang)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar - progress & complete */}
      <div className="bg-black/80 backdrop-blur-sm px-4 py-4 safe-bottom">
        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-white/60 text-xs">{t('videoProgress', lang)}</span>
            <span className="text-white text-xs font-bold" style={{ color: watchProgress >= 80 ? '#22c55e' : tc.primaryLight }}>
              {watchProgress}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${watchProgress}%`,
                background: watchProgress >= 80
                  ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                  : `linear-gradient(90deg, ${tc.primaryDark}, ${tc.primary})`,
              }}
            />
          </div>
        </div>

        {/* Complete button */}
        <button
          onClick={handleComplete}
          disabled={!canComplete || isCompleting}
          className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
            canComplete
              ? 'text-white shadow-lg'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
          style={canComplete ? {
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
          } : {}}
        >
          {isCompleting ? (
            <div className="w-5 h-5 border-2 rounded-full animate-spin border-white/30 border-t-white" />
          ) : canComplete ? (
            <>
              <CheckCircle2 className="w-5 h-5" />
              {t('completeLesson', lang)}
            </>
          ) : (
            <>
              <Clock className="w-4 h-4" />
              {t('watchToComplete', lang)}
            </>
          )}
        </button>

        {!canComplete && isYouTube && (
          <p className="text-center text-white/30 text-[10px] mt-2">
            {lang === 'ar'
              ? `شاهد ${80 - watchProgress > 0 ? 80 - watchProgress : 0}% إضافية لإتمام الدرس`
              : `Watch ${80 - watchProgress > 0 ? 80 - watchProgress : 0}% more to complete`}
          </p>
        )}
      </div>
    </div>
  );
}
