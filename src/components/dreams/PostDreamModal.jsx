import { useState } from 'react';
import Modal from '../ui/Modal';
import { dreams as dreamsApi } from '../../services/api';

const QUICK_PLATFORMS = ['X', 'Website', 'Instagram', 'TikTok', 'YouTube'];
const EMPTY_LINKS = [{ platform: '', url: '' }, { platform: '', url: '' }, { platform: '', url: '' }];

const sectionLabel = {
  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8, display: 'block',
};

export default function PostDreamModal({ open, onClose, onPosted }) {
  const [form, setForm] = useState({
    body: '', title: '',
    images: ['', '', ''],
    links: EMPTY_LINKS.map(l => ({ ...l })),
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
    if (wordCount > 12) { setError('Title must be 12 words or fewer'); return; }
    setLoading(true); setError('');
    try {
      const payload = {
        title:  form.title.trim(),
        body:   form.body.trim(),
        images: form.images.filter(u => u.trim()),
        links:  form.links.filter(l => l.platform.trim() && l.url.trim()),
      };
      const result = await dreamsApi.post(payload);
      onPosted?.(result.dream);
      onClose();
      setForm({ body: '', title: '', images: ['', '', ''], links: EMPTY_LINKS.map(l => ({ ...l })) });
      setTitleGenerated(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post dream');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Post Your Dream" maxWidth={760}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* ── Two-column grid — collapses to one on narrow screens ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '0 28px',
        }}>

          {/* ── LEFT: Body + Title ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 18 }}>

            <div>
              <label style={sectionLabel}>Your Dream</label>
              <textarea
                className="input" required
                style={{ resize: 'none', minHeight: 200, overflow: 'hidden', lineHeight: 1.7 }}
                placeholder="Write your dream. Tell the story. Why this dream, why you, why now. Take as much space as you need."
                value={form.body}
                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              />
            </div>

            <div>
              <label style={sectionLabel}>
                Title
                <span style={{
                  marginLeft: 8,
                  color: wordCount > 12 ? 'var(--fading)' : wordCount > 10 ? 'rgba(255,180,0,0.8)' : 'var(--text-3)',
                }}>{wordCount}/12 words</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input" required style={{ flex: 1, minWidth: 0 }}
                  placeholder="A title for your dream"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={generateTitle}
                  disabled={titleLoading || !form.body.trim()}
                  style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {titleLoading ? '···' : titleGenerated ? 'Regenerate ↺' : 'Generate ✦'}
                </button>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Images + Links ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 18 }}>

            <div>
              <label style={sectionLabel}>
                Images <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: '0.72rem' }}>(optional — up to 3 URLs)</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.images.map((url, i) => (
                  <input key={i} className="input" placeholder={`Image URL ${i + 1}`}
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

            <div>
              <label style={sectionLabel}>
                Links <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: '0.72rem' }}>(optional — up to 3)</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {form.links.map((link, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 'var(--r-md)', padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                      {QUICK_PLATFORMS.map(p => (
                        <button key={p} type="button"
                          onClick={() => setLink(i, 'platform', p)}
                          style={{
                            padding: '2px 9px', borderRadius: 99, fontSize: '0.68rem', cursor: 'pointer',
                            background: link.platform === p ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${link.platform === p ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.09)'}`,
                            color: link.platform === p ? 'var(--gold)' : 'var(--text-3)',
                            transition: 'all 0.12s',
                          }}>{p}</button>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 6 }}>
                      <input className="input" placeholder="Platform"
                        style={{ fontSize: '0.8rem' }}
                        value={link.platform}
                        onChange={e => setLink(i, 'platform', e.target.value)}
                      />
                      <input className="input" placeholder="URL"
                        style={{ fontSize: '0.8rem' }}
                        value={link.url}
                        onChange={e => setLink(i, 'url', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0 20px' }} />

        {/* ── Error ── */}
        {error && (
          <div style={{
            background: 'rgba(255,31,90,0.08)', border: '1px solid rgba(255,31,90,0.25)',
            borderRadius: 'var(--r-md)', padding: '10px 14px',
            fontSize: '0.82rem', color: 'var(--fading)', marginBottom: 16,
          }}>{error}</div>
        )}

        {/* ── Actions ── */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Posting...' : 'Post My Dream'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
