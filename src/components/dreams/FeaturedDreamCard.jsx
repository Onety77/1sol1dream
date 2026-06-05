import { Link } from 'react-router-dom';
import { beliefs as beliefApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useState } from 'react';

const STATE_META = {
  alive:       { label: 'ALIVE',     color: '#00FFD1', rgb: '0,255,209',   accentA: 'rgba(0,255,209,0.9)',   accentB: 'rgba(0,255,209,0.3)'  },
  fading:      { label: 'FADING',    color: '#FF1F5A', rgb: '255,31,90',   accentA: 'rgba(255,31,90,0.9)',   accentB: 'rgba(255,31,90,0.3)'  },
  grey:        { label: 'FADED',     color: '#3A3A5A', rgb: '58,58,90',    accentA: 'rgba(58,58,90,0.5)',    accentB: 'rgba(58,58,90,0.1)'   },
  resurrected: { label: 'RISEN',     color: '#BF5FFF', rgb: '191,95,255',  accentA: 'rgba(191,95,255,0.9)', accentB: 'rgba(191,95,255,0.3)' },
  crowned:     { label: 'CROWNED',   color: '#FFD700', rgb: '255,215,0',   accentA: 'rgba(255,215,0,0.9)',   accentB: 'rgba(255,215,0,0.3)'  },
};

const MOOD_EMOJI = {
  Serious: '🎯', Funny: '😂', Delusional: '🌀', Beautiful: '✨',
  Degenerate: '🔥', Impossible: '🚀', Unfinished: '⏳',
};

const BG_MAP = {
  alive:       'radial-gradient(ellipse 110% 60% at 70% 0%, rgba(0,255,209,0.09) 0%, transparent 55%), radial-gradient(ellipse 70% 90% at 5% 100%, rgba(0,20,16,0.6) 0%, transparent 60%), linear-gradient(160deg, #060E14 0%, #030B10 60%, #050A0E 100%)',
  fading:      'radial-gradient(ellipse 110% 60% at 70% 0%, rgba(255,31,90,0.09) 0%, transparent 55%), radial-gradient(ellipse 70% 90% at 5% 100%, rgba(20,2,6,0.6) 0%, transparent 60%), linear-gradient(160deg, #110408 0%, #0A0205 60%, #0F0308 100%)',
  grey:        'linear-gradient(160deg, #080808 0%, #050505 60%, #080808 100%)',
  resurrected: 'radial-gradient(ellipse 110% 60% at 70% 0%, rgba(191,95,255,0.08) 0%, transparent 55%), radial-gradient(ellipse 70% 90% at 5% 100%, rgba(14,4,20,0.6) 0%, transparent 60%), linear-gradient(160deg, #0D0818 0%, #080412 60%, #0B0616 100%)',
  crowned:     'radial-gradient(ellipse 110% 60% at 70% 0%, rgba(255,215,0,0.09) 0%, transparent 50%), radial-gradient(ellipse 70% 90% at 5% 100%, rgba(20,14,0,0.6) 0%, transparent 60%), linear-gradient(160deg, #110D02 0%, #0C0902 60%, #0F0C02 100%)',
};

export default function FeaturedDreamCard({ dream, myBeliefs = [], onBelief, rank = 1 }) {
  const { user } = useAuthStore();
  const [loading, setLoading]   = useState(false);
  const [count, setCount]       = useState(dream.beliefCount || 0);
  const [believed, setBelieved] = useState(myBeliefs.includes(dream.id));
  const [hovered, setHovered]   = useState(false);

  const state     = dream.state || 'alive';
  const meta      = STATE_META[state] || STATE_META.alive;
  const isGrey    = state === 'grey';
  const isCrowned = state === 'crowned';
  const isOwn     = user?.userId === dream.userId;
  const canBelieve = user && !isOwn && !believed && !isGrey;

  const handleBelieve = async () => {
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

  const rankLabel = rank === 1 ? '♛ #1 DREAM' : `#${rank} DREAM`;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        borderRadius: 22,
        overflow: 'hidden',
        transform: hovered && !isGrey ? 'translateY(-5px)' : 'translateY(0)',
        transition: 'transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1)',
        filter: isGrey ? 'grayscale(80%) brightness(0.5)' : 'none',
        cursor: 'default',
      }}
      className={`feat-glow-${state}`}
    >
      {/* Background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: BG_MAP[state] || BG_MAP.alive,
      }} />

      {/* Noise grain */}
      <div className="card-noise-layer" style={{ borderRadius: 22 }} />

      {/* Top accent line — glows in state color */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${meta.accentA} 30%, ${meta.accentA} 70%, transparent 100%)`,
        boxShadow: isGrey ? 'none' : `0 0 18px ${meta.accentB}, 0 0 50px rgba(${meta.rgb},0.12)`,
      }} />

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 2,
        padding: 'clamp(24px, 3.5vw, 40px) clamp(24px, 4vw, 44px) clamp(22px, 3vw, 36px)',
      }}>

        {/* ── Kicker line ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 20, flexWrap: 'wrap',
        }}>
          {/* Rank badge */}
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: '0.65rem', letterSpacing: '0.04em',
            padding: '5px 14px', borderRadius: 99,
            background: isCrowned
              ? 'linear-gradient(135deg, #FFD700, #FF9900)'
              : `rgba(${meta.rgb},0.12)`,
            color: isCrowned ? '#000' : meta.color,
            border: isCrowned ? 'none' : `1px solid rgba(${meta.rgb},0.3)`,
            boxShadow: isCrowned ? '0 0 18px rgba(255,215,0,0.45)' : 'none',
          }}>{rankLabel}</span>

          <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.14)', flexShrink: 0 }} />

          {/* Mood */}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
            letterSpacing: '0.12em', color: 'var(--text-3)', textTransform: 'uppercase',
          }}>{MOOD_EMOJI[dream.mood]} {dream.mood}</span>

          {/* Live state indicator */}
          <div style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-mono)', fontSize: '0.54rem', letterSpacing: '0.1em',
            color: meta.color,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: meta.color,
              boxShadow: isGrey ? 'none' : `0 0 8px rgba(${meta.rgb},0.9)`,
              animation: isGrey ? 'none' : 'blink 1.4s ease-in-out infinite',
            }} />
            {meta.label}
          </div>
        </div>

        {/* ── Headline ── */}
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 900,
          fontSize: 'clamp(1.15rem, 2.8vw, 1.8rem)',
          lineHeight: 1.15, letterSpacing: '-0.035em',
          color: isCrowned ? 'var(--gold)' : isGrey ? 'var(--text-3)' : 'var(--text)',
          textShadow: isCrowned ? '0 0 40px rgba(255,215,0,0.2)' : 'none',
          marginBottom: 14,
        }}>{dream.title}</h2>

        {/* ── Story excerpt ── */}
        {dream.story && (
          <p style={{
            fontSize: 'clamp(0.82rem, 1.4vw, 0.94rem)',
            color: isGrey ? 'var(--text-3)' : 'rgba(240,240,255,0.58)',
            lineHeight: 1.75, marginBottom: 26,
            display: '-webkit-box', WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
            maxWidth: 680,
          }}>{dream.story}</p>
        )}

        {/* ── Proof image ── */}
        {dream.proofImageUrl && (
          <img
            src={dream.proofImageUrl}
            alt="proof"
            style={{
              maxHeight: 140, borderRadius: 10, marginBottom: 20,
              objectFit: 'cover', border: `1px solid rgba(${meta.rgb},0.15)`,
            }}
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          paddingTop: 18,
          borderTop: `1px solid rgba(${meta.rgb},${isGrey ? 0.04 : 0.1})`,
          flexWrap: 'wrap',
        }}>
          {/* Author */}
          <Link to={`/profile/${dream.walletAddress}`} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            textDecoration: 'none', flex: 1, minWidth: 0,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: `linear-gradient(135deg,
                hsl(${((dream.walletAddress?.charCodeAt(0)||0)*7)%360},65%,55%),
                hsl(${((dream.walletAddress?.charCodeAt(2)||0)*11)%360},65%,40%))`,
              border: isCrowned ? '2px solid rgba(255,215,0,0.35)' : '2px solid rgba(255,255,255,0.1)',
            }} />
            <div style={{ minWidth: 0 }}>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                color: 'var(--text-2)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>@{dream.username}</p>
              {dream.proofLink && (
                <a href={dream.proofLink} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: '0.6rem', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                  🔗 proof
                </a>
              )}
            </div>
          </Link>

          {/* Belief count */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexShrink: 0 }}>
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              fontSize: 'clamp(1.5rem, 3vw, 1.9rem)', lineHeight: 1,
              color: 'var(--gold)',
              textShadow: count > 0 ? '0 0 22px rgba(255,215,0,0.5)' : 'none',
            }}>{believed ? '★' : '☆'} {count}</span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.5rem',
              letterSpacing: '0.14em', color: 'var(--text-3)', textTransform: 'uppercase',
            }}>Beliefs</span>
          </div>

          {/* CTA */}
          {canBelieve && (
            <button onClick={handleBelieve} disabled={loading} style={{
              padding: '11px 22px', borderRadius: 99, flexShrink: 0,
              background: `rgba(${meta.rgb},0.1)`,
              border: `1px solid rgba(${meta.rgb},0.35)`,
              color: meta.color, fontFamily: 'var(--font-body)',
              fontWeight: 700, fontSize: '0.84rem',
              cursor: 'pointer', transition: 'all 0.22s',
              backdropFilter: 'blur(12px)',
              boxShadow: `0 0 20px rgba(${meta.rgb},0.08)`,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = `rgba(${meta.rgb},0.2)`; e.currentTarget.style.boxShadow = `0 0 30px rgba(${meta.rgb},0.18)`; }}
              onMouseLeave={e => { e.currentTarget.style.background = `rgba(${meta.rgb},0.1)`; e.currentTarget.style.boxShadow = `0 0 20px rgba(${meta.rgb},0.08)`; }}
            >
              {loading ? '···' : 'Believe in This Dream'}
            </button>
          )}
          {believed && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              color: 'var(--gold)', fontWeight: 700, flexShrink: 0,
            }}>✓ You believed</span>
          )}
          {!user && !isGrey && !isCrowned && (
            <Link to="/signup" className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
              Join to believe
            </Link>
          )}
          {isCrowned && (
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              fontSize: '0.72rem', letterSpacing: '0.04em',
              color: 'var(--gold)', flexShrink: 0,
              textShadow: '0 0 20px rgba(255,215,0,0.5)',
            }}>♛ Winner</span>
          )}
        </div>
      </div>
    </div>
  );
}
