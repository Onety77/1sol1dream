import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { listenDream, listenComments, getDb } from '../services/firebase';
import { dreams as dreamsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

const PLATFORM_ICONS = {
  'X': '𝕏', 'Website': '🌐', 'Instagram': '📸',
  'TikTok': '🎵', 'YouTube': '▶',
};

function timeAgo(ts) {
  const t = ts?.seconds ? ts.seconds * 1000
    : ts?.toDate ? ts.toDate().getTime()
    : typeof ts === 'number' ? ts : Date.now();
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Avatar({ id, size = 30 }) {
  const h1 = (id?.charCodeAt(0) || 0) * 7 % 360;
  const h2 = (id?.charCodeAt(2) || 0) * 11 % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, hsl(${h1},65%,55%), hsl(${h2},65%,40%))`,
    }} />
  );
}

export default function DreamDetail() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const { user }    = useAuthStore();
  const [dream,    setDream]    = useState(null);
  const [comments, setComments] = useState([]);
  const [believers, setBelievers] = useState([]);
  const [commentText,    setCommentText]    = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Real-time dream + comments
  useEffect(() => {
    const unsubDream    = listenDream(id, d => { setDream(d); setLoading(false); });
    const unsubComments = listenComments(id, cs => setComments(cs));
    return () => { unsubDream(); unsubComments(); };
  }, [id]);

  // One-time believers fetch
  useEffect(() => {
    if (!dream?.roundId) return;
    const db = getDb();
    getDocs(query(
      collection(db, 'dream_beliefs_log'),
      where('dreamId', '==', id),
      where('roundId', '==', dream.roundId)
    )).then(async snap => {
      const uniqueUserIds = [...new Set(snap.docs.map(d => d.data().userId).filter(Boolean))];
      const userDocs = await Promise.all(
        uniqueUserIds.map(uid => getDoc(doc(db, 'dream_users', uid)))
      );
      setBelievers(
        userDocs.filter(d => d.exists()).map(d => ({
          userId: d.id,
          username: d.data().username,
          profilePicUrl: d.data().profilePicUrl || '',
        }))
      );
    }).catch(() => {});
  }, [id, dream?.roundId]);

  const submitComment = async e => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommentLoading(true);
    try {
      await dreamsApi.postComment(id, commentText.trim());
      setCommentText('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to post comment');
    } finally { setCommentLoading(false); }
  };

  if (loading) return (
    <div style={{ paddingTop: 120, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
  );
  if (!dream) return (
    <div style={{ paddingTop: 120, textAlign: 'center', color: 'var(--text-3)' }}>Dream not found.</div>
  );

  const hasImages = dream.images?.filter(Boolean).length > 0;
  const hasLinks  = dream.links?.filter(l => l.platform && l.url).length > 0;

  return (
    <div style={{ minHeight: '100vh', paddingTop: 88, paddingBottom: 100 }}>
      <div className="container" style={{ maxWidth: 720 }}>

        {/* Back */}
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: 'none', color: 'var(--text-2)',
          cursor: 'pointer', marginBottom: 24, fontSize: '0.85rem',
          padding: 0,
        }}>← Back</button>

        {/* Title */}
        <h1 style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 900,
          fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', letterSpacing: '-0.03em',
          lineHeight: 1.2, marginBottom: 16,
        }}>{dream.title}</h1>

        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
          <Link to={`/profile/${dream.walletAddress}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--text-2)', fontSize: '0.82rem' }}>
            <Avatar id={dream.walletAddress} size={24} />
            @{dream.username}
          </Link>
          <span style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>★ {dream.beliefCount || 0} believers</span>
          <span style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>💬 {dream.commentCount || 0}</span>
          {dream.mood && (
            <span style={{
              fontSize: '0.72rem', color: 'var(--text-2)',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 99, padding: '2px 10px',
            }}>{dream.mood}</span>
          )}
        </div>

        {/* Image gallery */}
        {hasImages && (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 28, paddingBottom: 4 }}>
            {dream.images.filter(Boolean).map((url, i) => (
              <img key={i} src={url} alt="" style={{
                height: 220, objectFit: 'cover', borderRadius: 10,
                flexShrink: 0, maxWidth: 380,
              }} />
            ))}
          </div>
        )}

        {/* Links */}
        {hasLinks && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
            {dream.links.filter(l => l.platform && l.url).map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 14px', borderRadius: 99,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--text-2)', fontSize: '0.8rem', textDecoration: 'none',
                transition: 'border-color 0.15s',
              }}>
                {PLATFORM_ICONS[l.platform] || '🔗'} {l.platform}
              </a>
            ))}
          </div>
        )}

        {/* Full body */}
        <p style={{
          whiteSpace: 'pre-wrap', fontSize: '1rem', lineHeight: 1.8,
          color: 'var(--text)', marginBottom: 48,
        }}>{dream.body || ''}</p>

        {/* Believers */}
        {believers.length > 0 && (
          <div style={{ marginBottom: 48 }}>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em',
              color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 14,
            }}>Believers</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {believers.map(b => (
                <Link key={b.userId} to={`/profile/${b.userId}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none', color: 'var(--text-2)', fontSize: '0.8rem' }}>
                  <Avatar id={b.userId} size={26} />
                  @{b.username}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 32 }} />

        {/* Comments */}
        <div>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em',
            color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 20,
          }}>Comments ({comments.length})</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 28 }}>
            {comments.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 12 }}>
                <Avatar id={c.userId} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>@{c.username}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{timeAgo(c.createdAt)}</span>
                  </div>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-2)', lineHeight: 1.55 }}>{c.text}</p>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No comments yet. Be the first.</p>
            )}
          </div>

          {user ? (
            <form onSubmit={submitComment} style={{ display: 'flex', gap: 10 }}>
              <input className="input" style={{ flex: 1 }}
                placeholder="Add a comment…"
                value={commentText}
                maxLength={500}
                onChange={e => setCommentText(e.target.value)}
              />
              <button type="submit" className="btn btn-primary"
                disabled={commentLoading || !commentText.trim()}>
                {commentLoading ? '···' : 'Post'}
              </button>
            </form>
          ) : (
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>
              <Link to="/login" style={{ color: 'var(--gold)' }}>Sign in</Link> to comment
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
