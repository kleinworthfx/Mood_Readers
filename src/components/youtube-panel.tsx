import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Youtube, Loader2, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analyzeText, type Analysis } from '@/lib/sentiment';
import { fetchYoutubeComments } from '@/lib/youtube.functions';

type Video = { id: string; title: string; channel: string; thumbnail: string; commentCount: number };

export function YoutubePanel({ onLoaded }: { onLoaded: (rows: Analysis[], name: string) => void }) {
  const fetchComments = useServerFn(fetchYoutubeComments);
  const [url, setUrl] = useState('');
  const [max, setMax] = useState(200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [video, setVideo] = useState<Video | null>(null);
  const [stats, setStats] = useState<{ analyzed: number; skipped: number; top: { text: string; likes: number; sentiment: string }[] } | null>(null);

  async function run() {
    setLoading(true); setError('');
    try {
      const res = await fetchComments({ data: { url, max } });
      if ('error' in res) { setError(res.error ?? 'Something went wrong.'); return; }
      const now = new Date().toISOString();
      const rows: Analysis[] = []; const liked: { text: string; likes: number; sentiment: string }[] = [];
      let skipped = 0;
      for (const c of res.comments) {
        try { const a = analyzeText(c.text, `YouTube · ${c.author}`, now); rows.push(a); liked.push({ text: c.text, likes: c.likes, sentiment: a.sentiment }); }
        catch { skipped++; }
      }
      if (!rows.length) { setError('No English comments could be analyzed for this video.'); return; }
      setVideo(res.video);
      setStats({ analyzed: rows.length, skipped, top: liked.sort((a, b) => b.likes - a.likes).slice(0, 3) });
      onLoaded(rows, res.video.title);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load comments.'); }
    finally { setLoading(false); }
  }

  return (
    <section className="surface analysis-panel mb-6">
      <div className="panel-heading"><h2 className="subheading flex items-center gap-2"><Youtube size={18} className="text-negative"/> YouTube comment analysis</h2><span className="small-caption">Paste any video or Shorts link</span></div>
      <div className="flex flex-col sm:flex-row gap-3">
        <input aria-label="YouTube link" className="field-input flex-1" placeholder="https://www.youtube.com/watch?v=… or /shorts/…" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && url && !loading && run()}/>
        <select aria-label="Number of comments" className="field-input" value={max} onChange={e => setMax(Number(e.target.value))}>
          <option value={100}>100 comments</option><option value={200}>200 comments</option><option value={500}>500 comments</option>
        </select>
        <Button size="sm" onClick={run} disabled={!url || loading}>{loading ? <Loader2 className="animate-spin"/> : <Youtube/>} {loading ? 'Fetching…' : 'Fetch & analyze'}</Button>
      </div>
      {error && <p role="alert" className="text-negative text-xs mt-3">{error}</p>}
      {video && stats && (
        <div className="result-block fade-in flex flex-col md:flex-row gap-4">
          {video.thumbnail && <img src={video.thumbnail} alt={video.title} className="w-full md:w-48 rounded-md object-cover"/>}
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{video.title}</p>
            <p className="small-caption">{video.channel} · {stats.analyzed} comments analyzed{stats.skipped ? ` · ${stats.skipped} non-English skipped` : ''} of {video.commentCount.toLocaleString('en-US')} total</p>
            <p className="small-caption mt-2">Results are loaded into the dashboard below and on Overview, Insights and Reports.</p>
            <div className="mt-3 space-y-1">{stats.top.map((t, i) => <p key={i} className="text-xs truncate"><span className={`text-${t.sentiment === 'neutral' ? 'muted-foreground' : t.sentiment}`}>●</span> <ThumbsUp size={11} className="inline"/> {t.likes} — {t.text}</p>)}</div>
          </div>
        </div>
      )}
    </section>
  );
}

