import { Link, useNavigate } from 'react-router-dom';
import { beliefs as beliefApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useState } from 'react';
import BoostModal from './BoostModal';

const STATE_META = {
  alive:       { label: 'ALIVE',       color: '#00FFD1', rgb: '0,255,209',   bg: 'rgba(0,255,209,0.08)',   border: 'rgba(0,255,209,0.22)'  },
  fading:      { label: 'FADING',      color: '#FF1F5A', rgb: '255,31,90',   bg: 'rgba(255,31,90,0.08)',   border: 'rgba(255,31,90,0.22)'  },
  grey:        { label: 'SOLD',        color: '#3A3A5A', rgb: '58,58,90',    bg: 'rgba(58,58,90,0.08)',    border: 'rgba(58,58,90,0.15)'   },
  resurrected: { label: 'RISEN',       color: '#BF5FFF', rgb: '191,95,255',  bg: 'rgba(191,95,255,0.08)', border: 'rgba(191,95,255,0.22)' },
  crowned:     { label: '♛ CROWNED',   color: '#FFD700', rgb: '255,215,0',   bg: 'rgba(255,215,0,0.08)',   border: 'rgba(255,215,0,0.22)'  },
};

const MOOD_EMOJI = {
  Serious: '🎯', Funny: '😂', Delusional: '🌀', Beautiful: '✨',
  Degenerate: '🔥', Impossible: '🚀', Unfinished: '⏳',
};

const RANK_COLOR = { 1: '#FFD700', 2: '#C0C0D0', 3: '#CD7F32' };

const CARD_BG = {
  alive:       'linear-gradient(160deg, #060F12 0%, #030A10 55%, #060810 100%)',
  fading:      'linear-gradient(160deg, #120408 0%, #0A0206 55%, #100308 100%)',
  grey:        'linear-gradient(160deg, #080808 0%, #050505 55%, #080808 100%)',
  resurrected: 'linear-gradient(160deg, #0E0818 0%, #080412 55%, #0C0616 100%)',
  crowned:     'linear-gradient(160deg, #120E02 0%, #0C0A02 55%, #100E03 100%)',
};

const ART_GLOW = {
  alive:       'radial-gradient(ellipse 110% 80% at 50% 20%, rgba(0,255,209,0.1) 0%, transparent 65%)',
  fading:      'radial-gradient(ellipse 110% 80% at 50% 20%, rgba(255,31,90,0.1) 0%, transparent 65%)',
  grey:        'none',
  resurrected: 'radial-gradient(ellipse 110% 80% at 50% 20%, rgba(191,95,255,0.09) 0%, transparent 65%)',
  crowned:     'radial-gradient(ellipse 110% 80% at 50% 20%, rgba(255,215,0,0.11) 0%, transparent 65%)',
};

/* ── Compact strip (Arena #4+) ─────────────────────────────────────── */
function CompactCard({ dream, myBeliefs, onBelief, rank }) {
  const { user } = useAuthStore();
  const [loading, setLoading]     = useState(false);
  const [count, setCount]         = useState(dream.beliefCount || 0);
  const [believed, setBelieved]   = useState(myBeliefs.includes(dream.id));
  const [hovered, setHovered]     = useState(false);

  const state   = dream.state || 'alive';
  const meta    = STATE_META[state] || STATE_META.alive;
  const isGrey  = state === 'grey';
  const isOwn   = user?.userId === dream.userId;
  const canBelieve = user && !isOwn && !believed && !isGrey;

  const handleBelieve = async e => {
    e.preventDefault();
    if (!canBelieve || loading) return;
    setLoading(true);
    try {
      await beliefApi.place(dream.id);
      setBelieved(true);
      setCount(c => c + 1);
      onBelief?.();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 0,
        borderRadius: 10,
        background: hovered ? `rgba(${meta.rgb},0.04)` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${hovered ? `rgba(${meta.rgb},0.18)` : 'rgba(255,255,255,0.055)'}`,
        transition: 'all 0.2s',
        filter: isGrey ? 'grayscale(80%) brightness(0.45)' : 'none',
        overflow: 'hidden',
      }}
    >
      {/* State stripe */}
      <div style={{
        width: 3, alignSelf: 'stretch', flexShrink: 0,
        background: isGrey ? 'rgba(255,255,255,0.06)' : `rgba(${meta.rgb},0.7)`,
        boxShadow: isGrey ? 'none' : `0 0 8px rgba(${meta.rgb},0.35)`,
      }} />

      {/* Rank */}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
        color: RANK_COLOR[rank] || 'var(--text-3)',
        padding: '10px 10px 10px 12px', flexShrink: 0, minWidth: 36,
      }}>#{rank}</span>

      {/* Title */}
      <p style={{
        flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: '0.75rem', lineHeight: 1.22,
        color: state === 'crowned' ? 'var(--gold)' : isGrey ? 'var(--text-3)' : 'var(--text)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        padding: '10px 8px',
      }}>{dream.title}</p>

      {/* Beliefs + button */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderLeft: '1px solid rgba(255,255,255,0.045)', flexShrink: 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.9rem',
          color: count > 0 ? 'var(--gold)' : 'var(--text-3)',
        }}>{believed ? '★' : '☆'} {count}</span>
        {canBelieve && (
          <button onClick={handleBelieve} disabled={loading}
            className="btn btn-gold btn-sm"
            style={{ padding: '3px 9px', fontSize: '0.66rem' }}>
            {loading ? '···' : '+'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Full Artifact Card ────────────────────────────────────────────── */
export default function DreamCard({ dream, myBeliefs = [], onBelief, rank, compact = false }) {
  const { user } = useAuthStore();
  const [loading, setLoading]     = useState(false);
  const [count, setCount]         = useState(dream.beliefCount || 0);
  const [believed, setBelieved]   = useState(myBeliefs.includes(dream.id));
  const [hovered, setHovered]     = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const navigate = useNavigate();

  if (compact) {
    return <CompactCard dream={dream} myBeliefs={myBeliefs} onBelief={onBelief} rank={rank} />;
  }

  const state      = dream.state || 'alive';
  const meta       = STATE_META[state] || STATE_META.alive;
  const isGrey     = state === 'grey';
  const isCrowned  = state === 'crowned';
  const isOwn      = user?.userId === dream.userId;
  const canBelieve = user && !isOwn && !believed && !isGrey;

  const handleBelieve = async e => {
    e.preventDefault();
    if (!canBelieve || loading) return;
    setLoading(true);
    try {
      await beliefApi.place(dream.id);
      setBelieved(true);
      setCount(c => c + 1);
      onBelief?.();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };

  /* rank badge label */
  const rankLabel = rank === 1 ? '♛ #1' : rank ? `#${rank}` : null;
  const rankColor = RANK_COLOR[rank] || meta.color;

  /* edition string — first 6 chars of id zero-padded */
  const edition = dream.id
    ? `1SOL·DREAM #${dream.id.slice(0, 6).toUpperCase()}`
    : '1SOL·DREAM';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/dreams/${dream.id}`)}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 260,
        aspectRatio: '2.5 / 3.5',
        borderRadius: 18,
        /* glow ring — CSS class handles the animation */
        filter: isGrey ? 'grayscale(85%) brightness(0.45)' : 'none',
        transform: hovered && !isGrey
          ? 'translateY(-10px) rotate(0.8deg) scale(1.04)'
          : 'translateY(0) rotate(0) scale(1)',
        transition: 'transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s',
        cursor: 'pointer',
      }}
      className={`card-glow-${state}`}
    >
      {/* Holographic spinning border */}
      {!isGrey && <div className="card-holo-border" style={{ borderRadius: 18 }} />}

      {/* Card body — sits inside the border */}
      <div style={{
        position: 'absolute',
        inset: isGrey ? 0 : 1.5,
        borderRadius: isGrey ? 18 : 17,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: CARD_BG[state] || CARD_BG.alive,
      }}>
        {/* Noise texture */}
        <div className="card-noise-layer" />
        {/* Foil sheen sweep */}
        {!isGrey && <div className="card-sheen-layer" />}

        {/* Art zone radial glow */}
        {ART_GLOW[state] !== 'none' && (
          <div style={{
            position: 'absolute', top: 32, left: 0, right: 0, height: '55%',
            background: ART_GLOW[state], pointerEvents: 'none', zIndex: 1,
          }} />
        )}

        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 2, flex: 1,
          display: 'flex', flexDirection: 'column',
          padding: '14px 13px 12px',
        }}>

          {/* ── Header ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start', marginBottom: 10,
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.42rem',
              letterSpacing: '0.14em', color: 'rgba(255,215,0,0.35)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '55%',
            }}>{edition}</span>

            {rankLabel && (
              <span style={{
                fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.52rem',
                padding: '3px 8px', borderRadius: 99,
                background: rank === 1 || isCrowned
                  ? 'linear-gradient(135deg, #FFD700, #FF9900)'
                  : `rgba(${meta.rgb},0.12)`,
                color: rank === 1 || isCrowned ? '#000' : rankColor,
                border: rank === 1 || isCrowned ? 'none' : `1px solid rgba(${meta.rgb},0.3)`,
                boxShadow: rank === 1 || isCrowned ? '0 0 14px rgba(255,215,0,0.45)' : 'none',
                letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
              }}>{rankLabel}</span>
            )}
          </div>

          {/* ── Art zone ── */}
          <div style={{
            flex: 1,
            borderRadius: 11,
            border: `1px solid rgba(${meta.rgb},${isGrey ? 0.05 : 0.12})`,
            background: 'rgba(255,255,255,0.02)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '14px 10px', textAlign: 'center',
            marginBottom: 10, position: 'relative', overflow: 'hidden',
          }}>
            {dream.images?.[0] && (
              <img
                src={dream.images[0]} alt=""
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover', opacity: 0.15, filter: 'blur(8px)',
                  borderRadius: 10, zIndex: 0,
                }}
              />
            )}

            {/* Mood icon */}
            <div style={{
              fontSize: '1.9rem', marginBottom: 10,
              animation: isGrey ? 'none' : 'icon-float-card 3s ease-in-out infinite',
              filter: `drop-shadow(0 0 10px rgba(${meta.rgb},${isGrey ? 0 : 0.55}))`,
              position: 'relative', zIndex: 1,
            }}>
              {MOOD_EMOJI[dream.mood] || '✨'}
            </div>

            {/* Dream title */}
            <h3 style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              fontSize: '0.7rem', lineHeight: 1.3, letterSpacing: '-0.015em',
              color: isCrowned ? 'var(--gold)' : isGrey ? 'var(--text-3)' : 'var(--text)',
              textShadow: isCrowned ? '0 0 20px rgba(255,215,0,0.25)' : 'none',
              marginBottom: 8,
              display: '-webkit-box', WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
              position: 'relative', zIndex: 1,
            }}>{dream.title}</h3>

            {(dream.body || '').length > 0 && (
              <p style={{
                fontSize: '0.75rem', color: 'var(--text-3)', lineHeight: 1.4,
                marginBottom: 6, marginTop: -4,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                position: 'relative', zIndex: 1,
              }}>
                {(dream.body || '').slice(0, 80)}{(dream.body || '').length > 80 ? '…' : ''}
              </p>
            )}

            {/* Mood badge */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 8px', borderRadius: 99,
              fontSize: '0.44rem', fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase',
              background: meta.bg, border: `1px solid ${meta.border}`,
              color: meta.color,
              position: 'relative', zIndex: 1,
            }}>
              {dream.mood}
            </span>
          </div>

          {/* ── Stats grid ── */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8, overflow: 'hidden', marginBottom: 10,
          }}>
            {/* Beliefs */}
            <div style={{ padding: '7px 4px', textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 900,
                fontSize: '0.82rem', lineHeight: 1,
                color: count > 0 ? 'var(--gold)' : 'var(--text-3)',
                textShadow: count > 5 ? '0 0 10px rgba(255,215,0,0.45)' : 'none',
              }}>{believed ? '★' : '☆'} {count}</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.38rem',
                letterSpacing: '0.1em', color: 'var(--text-3)',
                marginTop: 2, textTransform: 'uppercase',
              }}>Beliefs</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)' }} />

            {/* State */}
            <div style={{ padding: '7px 4px', textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 900,
                fontSize: '0.58rem', lineHeight: 1,
                color: meta.color,
                textShadow: isGrey ? 'none' : `0 0 8px rgba(${meta.rgb},0.5)`,
              }}>{meta.label}</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.38rem',
                letterSpacing: '0.1em', color: 'var(--text-3)',
                marginTop: 2, textTransform: 'uppercase',
              }}>Status</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)' }} />

            {/* Rank or Comments */}
            <div style={{ padding: '7px 4px', textAlign: 'center' }}>
              {rank ? (
                <>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 900,
                    fontSize: '0.82rem', lineHeight: 1,
                    color: rankLabel ? rankColor : 'var(--text-3)',
                  }}>
                    {rankLabel || '—'}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.38rem',
                    letterSpacing: '0.1em', color: 'var(--text-3)',
                    marginTop: 2, textTransform: 'uppercase',
                  }}>Rank</div>
                </>
              ) : (
                <>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 900,
                    fontSize: '0.8rem', lineHeight: 1, color: 'var(--text-2)',
                  }}>💬 {dream.commentCount || 0}</div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.38rem',
                    letterSpacing: '0.1em', color: 'var(--text-3)',
                    marginTop: 2, textTransform: 'uppercase',
                  }}>Comments</div>
                </>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link
              to={`/profile/${dream.walletAddress}`}
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, textDecoration: 'none' }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg,
                  hsl(${((dream.walletAddress?.charCodeAt(0)||0)*7)%360},65%,55%),
                  hsl(${((dream.walletAddress?.charCodeAt(2)||0)*11)%360},65%,40%))`,
                border: isCrowned ? '1.5px solid rgba(255,215,0,0.4)' : '1.5px solid rgba(255,255,255,0.1)',
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.46rem',
                color: 'var(--text-2)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>@{dream.username}</span>
            </Link>

            {/* Boost button — logged-in users only */}
            {user && !isGrey && (
              <button
                onClick={e => { e.stopPropagation(); setBoostOpen(true); }}
                title="Boost this dream"
                style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(191,95,255,0.1)',
                  border: '1px solid rgba(191,95,255,0.25)',
                  color: 'var(--resurrected)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', cursor: 'pointer', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(191,95,255,0.22)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(191,95,255,0.1)'; }}
              >⚡</button>
            )}

            {/* Believe button or status */}
            {canBelieve && (
              <button
                onClick={e => { e.stopPropagation(); handleBelieve(e); }} disabled={loading}
                style={{
                  padding: '4px 10px', borderRadius: 99, flexShrink: 0,
                  background: `rgba(${meta.rgb},0.1)`,
                  border: `1px solid rgba(${meta.rgb},0.3)`,
                  color: meta.color, fontFamily: 'var(--font-body)',
                  fontWeight: 700, fontSize: '0.6rem',
                  cursor: 'pointer', transition: 'all 0.2s',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {loading ? '···' : 'Believe'}
              </button>
            )}
            {believed && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.52rem',
                color: 'var(--gold)', flexShrink: 0,
              }}>✓ Believed</span>
            )}
            {!canBelieve && !believed && !isOwn && !user && (
              <Link to="/signup" style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.46rem',
                color: 'var(--text-3)', flexShrink: 0,
              }}>Join →</Link>
            )}
          </div>

        </div>
      </div>

      <BoostModal open={boostOpen} onClose={() => setBoostOpen(false)} dream={dream} />
    </div>
  );
}
