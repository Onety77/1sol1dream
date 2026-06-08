import { useState, useRef } from 'react';
import Modal from '../ui/Modal';
import { dreams as dreamsApi } from '../../services/api';
import { uploadDreamImage } from '../../services/firebase';

const QUICK_PLATFORMS = ['X', 'Website', 'Instagram', 'TikTok', 'YouTube'];
const EMPTY_LINKS = [{ platform: '', url: '' }, { platform: '', url: '' }, { platform: '', url: '' }];

const sectionLabel = {
  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8, display: 'block',
};

export default function PostDreamModal({ open, onClose, onPosted }) {
  const [form, setForm] = useState({
    body: '', title: '',
    links: EMPTY_LINKS.map(l => ({ ...l })),
  });
  const [imageFile,      setImageFile]      = useState(null);
  const [imagePreview,   setImagePreview]   = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [titleLoading,   setTitleLoading]   = useState(false);
  const [titleGenerated, setTitleGenerated] = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

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

  const handleImageChange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setUploadProgress('');
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview('');
    setUploadProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (wordCount > 12) { setError('Title must be 12 words or fewer'); return; }
    setLoading(true); setError('');
    try {
      let imageUrl = '';
      if (imageFile) {
        setUploadProgress('Uploading image…');
        imageUrl = await uploadDreamImage(imageFile);
        setUploadProgress('');
      }
      const payload = {
        title:  form.title.trim(),
        body:   form.body.trim(),
        images: imageUrl ? [imageUrl] : [],
        links:  form.links.filter(l => l.platform.trim() && l.url.trim()),
      };
      const result = await dreamsApi.post(payload);
      onPosted?.(result.dream);
      onClose();
      setForm({ body: '', title: '', links: EMPTY_LINKS.map(l => ({ ...l })) });
      setImageFile(null); setImagePreview(''); setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTitleGenerated(false);
    } catch (err) {
      setUploadProgress('');
      setError(err.response?.data?.error || err.message || 'Failed to post dream');
    } finally { setLoading(false); }
  };

  const footerContent = (
    <>
      {error && (
        <div style={{
          background: 'rgba(255,31,90,0.08)', border: '1px solid rgba(255,31,90,0.25)',
          borderRadius: 'var(--r-md)', padding: '10px 14px',
          fontSize: '0.82rem', color: 'var(--fading)', marginBottom: 12,
        }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="post-dream-form" className="btn btn-primary" disabled={loading}>
          {loading ? 'Posting...' : 'Post My Dream'}
        </button>
      </div>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="Post Your Dream" maxWidth={760} footer={footerContent}>
      <form id="post-dream-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

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
                Image <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: '0.72rem' }}>(optional)</span>
              </label>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageChange}
              />

              {!imagePreview ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: '100%', padding: '28px 16px',
                    border: '1.5px dashed rgba(255,255,255,0.12)',
                    borderRadius: 'var(--r-md)',
                    background: 'rgba(255,255,255,0.02)',
                    color: 'var(--text-3)', fontSize: '0.82rem',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 8, transition: 'border-color 0.2s, background 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,215,0,0.3)';
                    e.currentTarget.style.background = 'rgba(255,215,0,0.04)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  }}
                >
                  <span style={{ fontSize: '1.6rem', opacity: 0.5 }}>↑</span>
                  <span>Click to upload an image</span>
                  <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>PNG, JPG, GIF, WEBP — max 5 MB</span>
                </button>
              ) : (
                <div style={{ position: 'relative', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                  <img
                    src={imagePreview}
                    alt="preview"
                    style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)',
                    pointerEvents: 'none',
                  }} />
                  <div style={{
                    position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 6,
                  }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        padding: '4px 10px', borderRadius: 99, fontSize: '0.7rem', cursor: 'pointer',
                        background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
                        color: '#fff', backdropFilter: 'blur(8px)',
                      }}>Change</button>
                    <button
                      type="button"
                      onClick={removeImage}
                      style={{
                        padding: '4px 10px', borderRadius: 99, fontSize: '0.7rem', cursor: 'pointer',
                        background: 'rgba(255,31,90,0.3)', border: '1px solid rgba(255,31,90,0.4)',
                        color: '#fff', backdropFilter: 'blur(8px)',
                      }}>Remove</button>
                  </div>
                </div>
              )}

              {uploadProgress && (
                <div style={{ fontSize: '0.75rem', color: 'var(--gold)', marginTop: 6, opacity: 0.8 }}>
                  {uploadProgress}
                </div>
              )}
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

      </form>
    </Modal>
  );
}
