import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export function extractVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1, 12) || null;
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v.slice(0, 11);
      const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch { /* not a url */ }
  return null;
}

export type YoutubeComment = { text: string; author: string; likes: number; publishedAt: string };

export const fetchYoutubeComments = createServerFn({ method: 'POST' })
  .inputValidator((d: { url: string; max?: number }) => z.object({ url: z.string().min(1).max(500), max: z.number().int().min(20).max(500).optional() }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) return { error: 'YouTube access is not configured.' } as const;
    const videoId = extractVideoId(data.url);
    if (!videoId) return { error: 'That does not look like a YouTube video link.' } as const;
    const max = data.max ?? 200;

    const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${key}`);
    const vJson: any = await vRes.json();
    if (!vRes.ok) return { error: vJson?.error?.message ?? 'Could not reach YouTube.' } as const;
    const video = vJson.items?.[0];
    if (!video) return { error: 'Video not found or is private.' } as const;

    const comments: YoutubeComment[] = [];
    let pageToken = '';
    while (comments.length < max) {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&order=relevance&textFormat=plainText&key=${key}${pageToken ? `&pageToken=${pageToken}` : ''}`);
      const j: any = await r.json();
      if (!r.ok) {
        const reason = j?.error?.errors?.[0]?.reason;
        return { error: reason === 'commentsDisabled' ? 'Comments are turned off for this video.' : (j?.error?.message ?? 'Could not load comments.') } as const;
      }
      for (const it of j.items ?? []) {
        const s = it.snippet.topLevelComment.snippet;
        comments.push({ text: String(s.textDisplay ?? '').slice(0, 5000), author: s.authorDisplayName, likes: s.likeCount ?? 0, publishedAt: s.publishedAt });
      }
      pageToken = j.nextPageToken;
      if (!pageToken) break;
    }
    return {
      video: { id: videoId, title: video.snippet.title as string, channel: video.snippet.channelTitle as string, thumbnail: (video.snippet.thumbnails?.medium?.url ?? '') as string, commentCount: Number(video.statistics?.commentCount ?? 0) },
      comments: comments.slice(0, max),
    } as const;
  });
