'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore, themeColorMap } from '@/lib/store';
import { t } from '@/lib/i18n';
import {
  X, Play, Pause, SkipForward, SkipBack, ListVideo,
  Clock, Calendar, ChevronLeft, ChevronRight, Film, Repeat, Shuffle,
} from 'lucide-react';

export interface PlaylistPlayerVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
  durationSeconds: number;
  position: number;
  channelTitle: string;
  publishedAt: string;
}

export interface PlaylistPlayerInfo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
}

interface YouTubePlaylistPlayerProps {
  videos: PlaylistPlayerVideo[];
  playlist: PlaylistPlayerInfo;
  startIndex?: number;
  onClose: () => void;
}

export function YouTubePlaylistPlayer({
  videos,
  playlist,
  startIndex = 0,
  onClose,
}: YouTubePlaylistPlayerProps) {
  const { language, themeColor } = useAppStore();
  const lang = language;
  const isRTL = lang === 'ar';
  const tc = themeColorMap[themeColor];

  const playerRef = useRef<any>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerIdRef = useRef(`yt-playlist-player-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  const [currentIndex, setCurrentIndex] = useState(Math.min(startIndex, videos.length - 1));
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [watchProgress, setWatchProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showQueue, setShowQueue] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [shuffleMode, setShuffleMode] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'one' | 'all'>('none');
  const [playOrder, setPlayOrder] = useState<number[]>(() => videos.map((_, i) => i));

  const currentVideo = videos[currentIndex];

  // Rebuild play order when shuffle toggles
  useEffect(() => {
    if (shuffleMode) {
      const indices = videos.map((_, i) => i);
      // Fisher-Yates shuffle (preserve current as first)
      const currentIdx = indices.splice(currentIndex, 1)[0];
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      setPlayOrder([currentIdx, ...indices]);
    } else {
      setPlayOrder(videos.map((_, i) => i));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffleMode, videos.length]);

  // Load YouTube IFrame API & initialize player
  useEffect(() => {
    if (!currentVideo) return;

    const playerId = playerIdRef.current;

    const createPlayer = () => {
      // Ensure the div exists in the DOM before creating the player
      const div = document.getElementById(playerId);
      if (!div) {
        // Retry on next frame if not yet rendered
        requestAnimationFrame(createPlayer);
        return;
      }

      // Destroy any previous player instance on this div
      if (playerRef.current && playerRef.current.destroy) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      playerRef.current = new (window as any).YT.Player(playerId, {
        videoId: currentVideo.videoId,
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
            setIsPlaying(true);
          },
          onStateChange: (event: any) => {
            // 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
            if (event.data === 0) {
              // Video ended
              if (repeatMode === 'one') {
                playerRef.current?.seekTo(0, true);
                playerRef.current?.playVideo();
              } else if (autoAdvance) {
                handleNext();
              } else if (repeatMode === 'all' && currentIndex === videos.length - 1) {
                setCurrentIndex(0);
              }
            } else if (event.data === 1) {
              setIsPlaying(true);
            } else if (event.data === 2) {
              setIsPlaying(false);
            }
          },
          onError: () => {
            // Try advancing to next video on error
            if (autoAdvance) handleNext();
          },
        },
      });
    };

    const onYouTubeIframeAPIReady = () => {
      // Use requestAnimationFrame to ensure DOM is committed
      requestAnimationFrame(createPlayer);
    };

    if ((window as any).YT && (window as any).YT.Player) {
      onYouTubeIframeAPIReady();
    } else {
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
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
      setIsPlayerReady(false);
      setWatchProgress(0);
      setCurrentTime(0);
      setDuration(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVideo?.videoId, lang]);

  // Poll progress
  useEffect(() => {
    if (!isPlayerReady) return;
    progressIntervalRef.current = setInterval(() => {
      try {
        const player = playerRef.current;
        if (player && player.getCurrentTime && player.getDuration) {
          const ct = player.getCurrentTime();
          const d = player.getDuration();
          if (d > 0) {
            setCurrentTime(ct);
            setDuration(d);
            setWatchProgress(Math.min(Math.round((ct / d) * 100), 100));
          }
        }
      } catch {}
    }, 1000);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isPlayerReady]);

  // Load a new video without recreating the player
  const loadVideo = useCallback((videoId: string) => {
    if (playerRef.current && playerRef.current.loadVideoById) {
      playerRef.current.loadVideoById(videoId);
      setIsPlaying(true);
      setWatchProgress(0);
      setCurrentTime(0);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (videos.length === 0) return;
    if (shuffleMode) {
      // Find next in play order
      const posInOrder = playOrder.indexOf(currentIndex);
      if (posInOrder < playOrder.length - 1) {
        setCurrentIndex(playOrder[posInOrder + 1]);
      } else if (repeatMode === 'all') {
        setCurrentIndex(playOrder[0]);
      }
    } else {
      if (currentIndex < videos.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else if (repeatMode === 'all') {
        setCurrentIndex(0);
      }
    }
  }, [videos.length, currentIndex, shuffleMode, playOrder, repeatMode]);

  const handlePrev = useCallback(() => {
    if (videos.length === 0) return;
    // If we're more than 3 seconds in, restart current video instead
    if (currentTime > 3 && playerRef.current && playerRef.current.seekTo) {
      playerRef.current.seekTo(0, true);
      return;
    }
    if (shuffleMode) {
      const posInOrder = playOrder.indexOf(currentIndex);
      if (posInOrder > 0) {
        setCurrentIndex(playOrder[posInOrder - 1]);
      } else if (repeatMode === 'all') {
        setCurrentIndex(playOrder[playOrder.length - 1]);
      }
    } else {
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      } else if (repeatMode === 'all') {
        setCurrentIndex(videos.length - 1);
      }
    }
  }, [videos.length, currentIndex, shuffleMode, playOrder, repeatMode, currentTime]);

  // When currentIndex changes and player is ready, load the new video
  useEffect(() => {
    if (isPlayerReady && currentVideo) {
      loadVideo(currentVideo.videoId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const togglePlayPause = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  };

  const seekTo = (percent: number) => {
    if (playerRef.current && duration > 0) {
      playerRef.current.seekTo((percent / 100) * duration, true);
      setWatchProgress(percent);
    }
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!currentVideo) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center">
        <p className="text-white/60 text-sm mb-4">{lang === 'ar' ? 'لا توجد فيديوهات للتشغيل' : 'No videos to play'}</p>
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm">
          {t('close', lang)}
        </button>
      </div>
    );
  }

  const NextArrow = isRTL ? SkipBack : SkipForward;
  const PrevArrow = isRTL ? SkipForward : SkipBack;

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col" dir="ltr">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 backdrop-blur-sm z-10 border-b border-white/10" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <ListVideo className="w-4 h-4 text-red-500 flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="text-white font-bold text-sm truncate">{playlist.title}</h2>
            <p className="text-white/50 text-[10px] mt-0.5">
              {currentIndex + 1} / {videos.length} • {playlist.channelTitle}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowQueue(!showQueue)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ms-2 ${
            showQueue ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'
          }`}
          title={t('queue', lang)}
        >
          <ListVideo className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors ms-1"
          title={t('closePlayer', lang)}
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden" dir={isRTL ? 'rtl' : 'ltr'}>
        {/* Video area */}
        <div className="flex-1 flex flex-col bg-black">
          {/* Video player */}
          <div className="flex-1 flex items-center justify-center relative">
            <div className="w-full max-w-4xl aspect-video">
              <div id={playerIdRef.current} className="w-full h-full" />
            </div>

            {/* Loading overlay */}
            {!isPlayerReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="w-12 h-12 border-4 rounded-full animate-spin border-white/20 border-t-red-500" />
              </div>
            )}
          </div>

          {/* Now playing info & controls */}
          <div className="bg-gradient-to-t from-black via-black/95 to-black/80 px-4 py-3 space-y-3">
            {/* Title */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-snug line-clamp-2">{currentVideo.title}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/60">
                  <span className="flex items-center gap-1">
                    <Film className="w-3 h-3" />
                    {currentVideo.channelTitle}
                  </span>
                  {currentVideo.duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {currentVideo.duration}
                    </span>
                  )}
                  {currentVideo.publishedAt && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(currentVideo.publishedAt).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div
                className="relative h-1.5 rounded-full bg-white/10 cursor-pointer group"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = ((e.clientX - rect.left) / rect.width) * 100;
                  seekTo(Math.max(0, Math.min(100, percent)));
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all"
                  style={{
                    width: `${watchProgress}%`,
                    background: 'linear-gradient(90deg, #FF0000, #FF4444)',
                  }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${watchProgress}% - 6px)` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px] text-white/50">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2">
              {/* Shuffle */}
              <button
                onClick={() => setShuffleMode(!shuffleMode)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  shuffleMode ? 'bg-red-500/20 text-red-400' : 'text-white/60 hover:bg-white/10'
                }`}
                title={t('shuffle', lang)}
              >
                <Shuffle className="w-4 h-4" />
              </button>

              {/* Previous */}
              <button
                onClick={handlePrev}
                disabled={currentIndex === 0 && !repeatMode.includes('all')}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white hover:bg-white/10 transition-colors disabled:opacity-30"
                title={t('previous', lang)}
              >
                <PrevArrow className="w-5 h-5" />
              </button>

              {/* Play/Pause */}
              <button
                onClick={togglePlayPause}
                className="w-12 h-12 rounded-full flex items-center justify-center bg-white text-black hover:scale-105 transition-transform mx-1"
                title={isPlaying ? t('pause', lang) : t('play', lang)}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ms-0.5" />}
              </button>

              {/* Next */}
              <button
                onClick={handleNext}
                disabled={currentIndex === videos.length - 1 && repeatMode !== 'all'}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white hover:bg-white/10 transition-colors disabled:opacity-30"
                title={t('next', lang)}
              >
                <NextArrow className="w-5 h-5" />
              </button>

              {/* Repeat */}
              <button
                onClick={() => {
                  if (repeatMode === 'none') setRepeatMode('all');
                  else if (repeatMode === 'all') setRepeatMode('one');
                  else setRepeatMode('none');
                }}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors relative ${
                  repeatMode !== 'none' ? 'bg-red-500/20 text-red-400' : 'text-white/60 hover:bg-white/10'
                }`}
                title={repeatMode === 'one' ? t('repeatOne', lang) : repeatMode === 'all' ? t('repeatAll', lang) : t('repeat', lang)}
              >
                <Repeat className="w-4 h-4" />
                {repeatMode === 'one' && (
                  <span className="absolute -top-0.5 -end-0.5 text-[8px] font-bold bg-red-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    1
                  </span>
                )}
              </button>
            </div>

            {/* Auto-advance toggle */}
            <div className="flex items-center justify-center gap-4 text-[10px]">
              <label className="flex items-center gap-1.5 cursor-pointer text-white/60 hover:text-white/80">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                  className="w-3 h-3 accent-red-500"
                />
                {t('autoAdvance', lang)}
              </label>
            </div>
          </div>
        </div>

        {/* Queue sidebar */}
        {showQueue && (
          <div className="w-72 bg-zinc-900/95 border-s border-white/10 flex flex-col" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListVideo className="w-4 h-4 text-red-500" />
                <h3 className="text-white font-bold text-xs">
                  {t('queue', lang)} ({videos.length})
                </h3>
              </div>
              <span className="text-[10px] text-white/40">
                {videos.reduce((sum, v) => sum + v.durationSeconds, 0) > 0
                  ? formatTime(videos.reduce((sum, v) => sum + v.durationSeconds, 0))
                  : ''}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {videos.map((video, idx) => {
                const isActive = idx === currentIndex;
                const isPlayed = idx < currentIndex;
                return (
                  <button
                    key={video.videoId}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 transition-colors text-start ${
                      isActive ? 'bg-red-500/15 border-s-2 border-red-500' : 'hover:bg-white/5 border-s-2 border-transparent'
                    }`}
                  >
                    <div className="relative w-14 h-9 rounded overflow-hidden flex-shrink-0 bg-white/5">
                      {video.thumbnail ? (
                        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="w-4 h-4 text-white/30" />
                        </div>
                      )}
                      {isActive && isPlaying ? (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="flex items-end gap-0.5 h-3">
                            <div className="w-0.5 bg-red-400 animate-pulse" style={{ height: '60%' }} />
                            <div className="w-0.5 bg-red-400 animate-pulse" style={{ height: '100%', animationDelay: '0.2s' }} />
                            <div className="w-0.5 bg-red-400 animate-pulse" style={{ height: '40%', animationDelay: '0.4s' }} />
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                          <Play className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <span className="absolute bottom-0.5 end-0.5 bg-black/80 text-white text-[8px] px-1 rounded">
                        {video.duration}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] font-medium leading-tight line-clamp-2 ${isActive ? 'text-red-400' : isPlayed ? 'text-white/40' : 'text-white/90'}`}>
                        {video.title}
                      </p>
                      <p className={`text-[9px] mt-0.5 ${isActive ? 'text-red-400/70' : 'text-white/40'}`}>
                        #{video.position + 1} • {video.channelTitle}
                      </p>
                    </div>
                    {isActive && (
                      <span className="text-[9px] text-red-400 font-bold flex-shrink-0">
                        {t('nowPlaying', lang)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Footer info */}
            <div className="px-3 py-2 border-t border-white/10 text-[10px] text-white/40">
              <p className="flex items-center justify-between">
                <span>{t('filterActive', lang)}</span>
                <span className="font-bold text-red-400">{videos.length} {t('videos', lang)}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
