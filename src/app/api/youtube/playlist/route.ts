import { NextRequest, NextResponse } from 'next/server';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

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
  addedToPlaylistAt: string; // ISO date when video was added to playlist
  publishedAt: string; // ISO date when video was published on YouTube
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

// Parse ISO 8601 duration to minutes
function parseDuration(iso: string): { text: string; minutes: number; seconds: number } {
  if (!iso) return { text: '0:00', minutes: 0, seconds: 0 };

  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return { text: '0:00', minutes: 0, seconds: 0 };

  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const totalMinutes = Math.ceil(totalSeconds / 60);

  if (hours > 0) {
    return {
      text: `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      minutes: totalMinutes,
      seconds: totalSeconds,
    };
  }
  return {
    text: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    minutes: totalMinutes,
    seconds: totalSeconds,
  };
}

function getThumbnail(thumbnails: Record<string, { url: string; width: number; height: number }>): string {
  if (thumbnails.maxres) return thumbnails.maxres.url;
  if (thumbnails.high) return thumbnails.high.url;
  if (thumbnails.standard) return thumbnails.standard.url;
  if (thumbnails.medium) return thumbnails.medium.url;
  if (thumbnails.default) return thumbnails.default.url;
  return '';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get('list');
    const userApiKey = searchParams.get('apiKey');

    if (!playlistId) {
      return NextResponse.json(
        { error: 'Missing playlist ID. Provide ?list=PLAYLIST_ID parameter.' },
        { status: 400 }
      );
    }

    const apiKey = userApiKey || process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'no_api_key',
          message: 'YouTube API key is required. Please set YOUTUBE_API_KEY environment variable or provide apiKey parameter.',
        },
        { status: 401 }
      );
    }

    // 1. Fetch playlist metadata
    const playlistRes = await fetch(
      `${YOUTUBE_API_BASE}/playlists?part=snippet,contentDetails&id=${playlistId}&key=${apiKey}`
    );

    if (!playlistRes.ok) {
      const errData = await playlistRes.json().catch(() => ({}));
      if (playlistRes.status === 403 || playlistRes.status === 400) {
        return NextResponse.json(
          { error: 'invalid_api_key', message: 'Invalid or unauthorized YouTube API key.' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: 'playlist_fetch_error', message: 'Failed to fetch playlist data from YouTube.', details: errData },
        { status: 500 }
      );
    }

    const playlistData = await playlistRes.json();
    if (!playlistData.items || playlistData.items.length === 0) {
      return NextResponse.json(
        { error: 'playlist_not_found', message: 'Playlist not found. Please check the URL and try again.' },
        { status: 404 }
      );
    }

    const playlistItem = playlistData.items[0];
    const playlistTitle = playlistItem.snippet?.title || 'Untitled Playlist';
    const playlistDescription = playlistItem.snippet?.description || '';
    const playlistThumbnail = getThumbnail(playlistItem.snippet?.thumbnails || {});
    const channelTitle = playlistItem.snippet?.channelTitle || '';
    const totalResults = playlistItem.contentDetails?.itemCount || 0;

    // 2. Fetch all playlist items (with pagination)
    const videos: PlaylistVideo[] = [];
    let nextPageToken = '';
    let position = 0;

    do {
      const itemsUrl = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${apiKey}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
      const itemsRes = await fetch(itemsUrl);

      if (!itemsRes.ok) {
        return NextResponse.json(
          { error: 'items_fetch_error', message: 'Failed to fetch playlist videos.' },
          { status: 500 }
        );
      }

      const itemsData = await itemsRes.json();
      nextPageToken = itemsData.nextPageToken || '';

      for (const item of itemsData.items || []) {
        const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
        if (!videoId) continue;

        // Skip deleted/private videos
        if (item.snippet?.title === 'Deleted video' || item.snippet?.title === 'Private video') continue;

        videos.push({
          videoId,
          title: item.snippet?.title || `Video ${position + 1}`,
          description: item.snippet?.description || '',
          thumbnail: getThumbnail(item.snippet?.thumbnails || {}),
          duration: '', // Will be filled in step 3
          durationMinutes: 0,
          durationSeconds: 0,
          position,
          channelTitle: item.snippet?.videoOwnerChannelTitle || channelTitle,
          addedToPlaylistAt: item.snippet?.publishedAt || item.contentDetails?.videoPublishedAt || '',
          publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || '',
        });
        position++;
      }
    } while (nextPageToken && videos.length < 500); // Safety limit

    // 3. Fetch video durations and publishedAt (batch - max 50 per request)
    const videoIds = videos.map((v) => v.videoId);
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const videosUrl = `${YOUTUBE_API_BASE}/videos?part=contentDetails,snippet&id=${batch.join(',')}&key=${apiKey}`;
      const videosRes = await fetch(videosUrl);

      if (videosRes.ok) {
        const videosData = await videosRes.json();
        for (const vd of videosData.items || []) {
          const idx = videos.findIndex((v) => v.videoId === vd.id);
          if (idx !== -1) {
            const parsed = parseDuration(vd.contentDetails?.duration || '');
            videos[idx].duration = parsed.text;
            videos[idx].durationMinutes = parsed.minutes;
            videos[idx].durationSeconds = parsed.seconds;
            // Use video's actual publishedAt if available (more accurate)
            if (vd.snippet?.publishedAt) {
              videos[idx].publishedAt = vd.snippet.publishedAt;
            }
          }
        }
      }
    }

    const result: PlaylistInfo = {
      id: playlistId,
      title: playlistTitle,
      description: playlistDescription,
      thumbnail: playlistThumbnail,
      channelTitle,
      videoCount: videos.length,
      videos,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('YouTube playlist fetch error:', error);
    return NextResponse.json(
      { error: 'server_error', message: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
