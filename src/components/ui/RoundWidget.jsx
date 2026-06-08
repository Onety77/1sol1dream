import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useRoundStore } from '../../store/roundStore';

function getTimeLeft(endsAt) {
  if (!endsAt) return null;
  const end = endsAt?.toDate ? endsAt.toDate()
    : endsAt?.seconds ? new Date(endsAt.seconds * 1000)
    : new Date(endsAt);
  const diff = end - Date.now();
  if (diff <= 0) return { h: 0, m: 0, s: 0, total: 0 };
  return {
    h: Math.floor(diff / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
    total: diff,
  };
}

const pad = n => String(n).padStart(2, '0');

export default function RoundWidget() {
  const { currentRound, potSOL } = useRoundStore();
  const [time, setTime]   = useState(() => getTimeLeft(currentRound?.endsAt));
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTime(getTimeLeft(currentRound?.endsAt));
    const id = setInterval(() => setTime(getTimeLeft(currentRound?.endsAt)), 1000);
    return () => clearInterval(id);
  }, [currentRound?.endsAt]);

  /* Fade in after mount */
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  if (!currentRound || !time) return null;

  const isCritical  = time.total > 0 && time.total < 600000;   /* < 10 min */
  const isUrgent    = time.total > 0 && time.total < 3600000;  /* < 1 hr  */
  const isExpired   = time.total <= 0;

  /* Color system */
  const accentColor = isCritical ? '#FF1F5A' : isUrgent ? '#FF9900' : '#FFD700';
  const accentRGB   = isCritical ? '255,31,90' : isUrgent ? '255,153,0' : '255,215,0';
  const glowAnim    = isCritical ? 'widget-critical' : isUrgent ? 'widget-urgent' : 'widget-idle';

  return (
    <Link
      to="/arena"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="round-widget-anchor"
      style={{
        position: 'fixed',
        bottom: 'var(--widget-bottom, 28px)',
        right: 20,
        zIndex: 150,
        textDecoration: 'none',
        display: 'flex',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          background: 'rgba(3,3,12,0.88)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: `1px solid rgba(${accentRGB},${hovered ? 0.45 : 0.22})`,
          borderRadius: 99,
          overflow: 'hidden',
          transition: 'border-color 0.25s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          transform: hovered ? 'scale(1.05)' : 'scale(1)',
          animation: `${glowAnim} ${isCritical ? '1.2s' : isUrgent ? '2s' : '3.5s'} ease-in-out infinite`,
        }}
      >
        {/* Pot SOL */}
        <div style={{
          padding: hovered ? '9px 16px' : '8px 14px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          transition: 'padding 0.2s',
          borderRight: `1px solid rgba(${accentRGB},0.16)`,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.44rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: `rgba(${accentRGB},0.6)`,
            lineHeight: 1,
            marginBottom: 3,
            transition: 'opacity 0.2s',
            opacity: hovered ? 1 : 0.7,
          }}>POT</span>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: hovered ? '0.92rem' : '0.82rem',
            color: accentColor,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            textShadow: `0 0 12px rgba(${accentRGB},0.55)`,
            transition: 'font-size 0.2s',
          }}>◎ {potSOL.toFixed(2)}</span>
        </div>

        {/* Timer */}
        <div style={{
          padding: hovered ? '9px 16px' : '8px 14px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          transition: 'padding 0.2s',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.44rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: `rgba(${accentRGB},0.6)`,
            lineHeight: 1,
            marginBottom: 3,
            opacity: hovered ? 1 : 0.7,
            transition: 'opacity 0.2s',
          }}>
            {isExpired ? 'ENDED' : isCritical ? '🔥 PAYOUT' : isUrgent ? '⚡ PAYOUT' : 'PAYOUT IN'}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: hovered ? '0.92rem' : '0.82rem',
            color: isExpired ? 'var(--text-3)' : accentColor,
            lineHeight: 1,
            letterSpacing: '0.04em',
            textShadow: isExpired ? 'none' : `0 0 10px rgba(${accentRGB},0.5)`,
            transition: 'font-size 0.2s',
            animation: isCritical ? 'blink 1s ease-in-out infinite' : 'none',
          }}>
            {isExpired
              ? 'DONE'
              : `${pad(time.h)}:${pad(time.m)}:${pad(time.s)}`}
          </span>
        </div>

        {/* Arrow hint on hover */}
        {hovered && (
          <div style={{
            padding: '8px 12px 8px 0',
            color: `rgba(${accentRGB},0.6)`,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            animation: 'fade-up 0.2s ease-out both',
          }}>→</div>
        )}
      </div>
    </Link>
  );
}
