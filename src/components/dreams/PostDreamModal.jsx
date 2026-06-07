import { useState } from 'react';
import Modal from '../ui/Modal';
import { dreams as dreamsApi } from '../../services/api';

const MOODS = ['Serious', 'Funny', 'Delusional', 'Beautiful', 'Degenerate', 'Impossible', 'Unfinished'];
const MOOD_EMOJI = { Serious:'🎯', Funny:'😂', Delusional:'🌀', Beautiful:'✨', Degenerate:'🔥', Impossible:'🚀', Unfinished:'⏳' };
const MOOD_ACCENT  = { Serious:'rgba(0,255,209,0.15)', Funny:'rgba(255,215,0,0.15)', Delusional:'rgba(191,95,255,0.15)', Beautiful:'rgba(0,240,255,0.15)', Degenerate:'rgba(255,31,90,0.15)', Impossible:'rgba(255,110,0,0.15)', Unfinished:'rgba(120,120,160,0.15)' };
const MOOD_BORDER  = { Serious:'rgba(0,255,209,0.35)', Funny:'rgba(255,215,0,0.35)', Delusional:'rgba(191,95,255,0.35)', Beautiful:'rgba(0,240,255,0.35)', Degenerate:'rgba(255,31,90,0.35)', Impossible:'rgba(255,110,0,0.35)', Unfinished:'rgba(120,120,160,0.35)' };
const QUICK_PLATFORMS = ['X', 'Website', 'Instagram', 'TikTok', 'YouTube'];

const EMPTY_LINKS = [{ platform: '', url: '' }, { platform: '', url: '' }, { platform: '', url: '' }];

export default function PostDreamModal({ open, onClose, onPosted }) {
  const [form, setForm] = useState({
    body: '', title: '',
    images: ['', '', ''],
    links: EMPTY_LINKS.map(l => ({ ...l })),
    mood: '',
  });
  const [titleLoading,   setTitleLoading]   = useState(false);
  const [titleGenerated, setTitleGenerated] = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const wordCount = form.title.trim() ? form.title.trim().split(/\s+/).filter(Boolean).length : 0;

  const generateTitle = async () => {
    if (!form.body.trim()) { setError('Write your dream first'); return; }
    setTitleLoading(true); setError('');
    try {
      const { title } = await dreamsApi.generateTitle(form.body);
      setForm(f => ({ ...f, title }));
      setTitleGenerated(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to generate title');
    } finally { setTitleLoading(false); }
  };

  const setLink = (i, field, value) => {
    setForm(f => {
      const links = f.links.map((l, idx) => idx === i ? { ...l, [field]: value } : l);
      return { ...f, links };
    });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.mood) { setError('Pick a mood for your dream'); return; }
    if (wordCount > 12) { setError('Title must be 12 words or fewer'); return; }
    setLoading(true); setError('');
    try {
      const payload = {
        title:  form.title.trim(),
        body:   form.body.trim(),
        mood:   form.mood,
        images: form.images.filter(u => u.trim()),
        links:  form.links.filter(l => l.platform.trim() && l.url.trim()),
      };
      const result = await dreamsApi.post(payload);
      onPosted?.(result.dream);
      onClose();
      setForm({ body: '', title: '', images: ['', '', ''], links: EMPTY_LINKS.map(l => ({ ...l })), mood: '' });
      setTitleGenerated(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post dream');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Post Your Dream" maxWidth={600}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* ── Body ── */}
        <div>
          <label className="input-label">Your Dream</label>
          <textarea
            className="input" required
            style={{ resize: 'none', minHeight: 140, overflow: 'hidden' }}
            placeholder="Write your dream. Tell the story. Why this dream, why you, why now. Take as much space as you need."
            value={form.body}
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
          />
        </div>

        {/* ── Title ── */}
        <div>
          <label className="input-label">
            Title
            <span style={{
              marginLeft: 8, fontFamily: 'var(--font-mono)',
              color: wordCount > 12 ? 'var(--fading)' : wordCount > 10 ? 'rgba(255,180,0,0.8)' : 'var(--text-3)',
              fontSize: '0.75rem',
            }}>{wordCount}/12 words</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input" required style={{ flex: 1 }}
              placeholder="A title for your dream"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={generateTitle}
              disabled={titleLoading || !form.body.trim()}
              style={{ flexShrink: 0, minWidth: 100 }}>
              {titleLoading ? '···' : titleGenerated ? 'Regenerate ↺' : 'Generate ✦'}
            </button>
          </div>
        </div>

        {/* ── Images ── */}
        <div>
          <label className="input-label">Images <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.images.map((url, i) => (
              <input key={i} className="input" placeholder="Image URL"
                value={url}
                onChange={e => setForm(f => {
                  const images = [...f.images];
                  images[i] = e.target.value;
                  return { ...f, images };
                })}
              />
            ))}
          </div>
        </div>

        {/* ── Links ── */}
        <div>
          <label className="input-label">Links <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {form.links.map((link, i) => (
              <div key={i}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {QUICK_PLATFORMS.map(p => (
                    <button key={p} type="button"
                      onClick={() => setLink(i, 'platform', p)}
                      style={{
                        padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', cursor: 'pointer',
                        background: link.platform === p ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${link.platform === p ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        color: link.platform === p ? 'var(--gold)' : 'var(--text-2)',
                      }}>{p}</button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                  <input className="input" placeholder="Platform"
                    value={link.platform}
                    onChange={e => setLink(i, 'platform', e.target.value)}
                  />
                  <input className="input" placeholder="URL"
                    value={link.url}
                    onChange={e => setLink(i, 'url', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Mood ── */}
        <div>
          <label className="input-label">Mood</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MOODS.map(m => (
              <button key={m} type="button" onClick={() => setForm(f => ({ ...f, mood: m }))} style={{
                padding: '7px 14px', borderRadius: 'var(--r-full)', cursor: 'pointer',
                background: form.mood === m ? MOOD_ACCENT[m] : 'rgba(255,255,255,0.03)',
                border: `1px solid ${form.mood === m ? MOOD_BORDER[m] : 'rgba(255,255,255,0.08)'}`,
                color: form.mood === m ? 'var(--text)' : 'var(--text-2)',
                fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.15s',
                transform: form.mood === m ? 'scale(1.06)' : 'scale(1)',
              }}>{MOOD_EMOJI[m]} {m}</button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(255,31,90,0.08)', border: '1px solid rgba(255,31,90,0.25)',
            borderRadius: 'var(--r-md)', padding: '10px 14px',
            fontSize: '0.82rem', color: 'var(--fading)',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading || !form.mood}>
            {loading ? 'Posting...' : 'Post My Dream'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
