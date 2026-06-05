import { useState, useEffect } from 'react';

function getTimeLeft(endsAt) {
  if (!endsAt) return null;
  const end = endsAt?.toDate ? endsAt.toDate()
    : endsAt?.seconds ? new Date(endsAt.seconds * 1000) : new Date(endsAt);
  const diff = end - Date.now();
  if (diff <= 0) return { h: 0, m: 0, s: 0, total: 0 };
  return {
    h: Math.floor(diff / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
    total: diff,
  };
}

export default function CountdownTimer({ endsAt, compact = false, large = false }) {
  const [time, setTime] = useState(() => getTimeLeft(endsAt));
  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft(endsAt)), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!time) return null;
  const urgent = time.total > 0 && time.total < 3600000;
  const color  = urgent ? 'var(--fading)' : compact ? 'var(--text-2)' : 'var(--gold)';
  const pad    = n => String(n).padStart(2, '0');

  if (compact) {
    return (
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color,
        letterSpacing: '0.04em',
        textShadow: urgent ? '0 0 8px rgba(255,31,90,0.6)' : 'none',
      }}>
        {pad(time.h)}:{pad(time.m)}:{pad(time.s)}
      </span>
    );
  }

  if (large) {
    const isXL  = large === 'xl';
    const fs    = isXL ? 'clamp(2.2rem,5vw,3.5rem)' : 'clamp(1.6rem,3.5vw,2.5rem)';
    const colon = isXL ? '1.8rem' : '1.4rem';
    const mb    = isXL ? 28 : 22;
    return (
      <div style={{ display: 'flex', gap: isXL ? 16 : 12, alignItems: 'flex-end' }}>
        {[{ val: time.h, label: 'hrs' }, { val: time.m, label: 'min' }, { val: time.s, label: 'sec' }].map(({ val, label }, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'flex-end', gap: i < 2 ? (isXL ? 16 : 12) : 0 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: fs, fontWeight: 900,
                color, lineHeight: 1,
                textShadow: `0 0 ${isXL ? 40 : 30}px ${urgent ? 'rgba(255,31,90,0.55)' : 'rgba(255,215,0,0.4)'}`,
                minWidth: isXL ? 'clamp(72px,9vw,96px)' : 64,
                letterSpacing: '-0.03em',
                animation: urgent && label === 'sec' ? 'blink 1s ease-in-out infinite' : 'none',
              }}>{pad(val)}</div>
              <div style={{
                fontSize: isXL ? '0.6rem' : '0.55rem',
                color: 'var(--text-3)',
                letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: isXL ? 8 : 6,
                fontFamily: 'var(--font-mono)',
              }}>{label}</div>
            </div>
            {i < 2 && (
              <div style={{
                color: urgent ? color : 'var(--text-3)',
                marginBottom: mb, fontSize: colon,
                fontFamily: 'var(--font-mono)',
                animation: 'blink 1.2s ease-in-out infinite',
                opacity: urgent ? 1 : 0.5,
              }}>:</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {[{ val: time.h }, { val: time.m }, { val: time.s }].map(({ val }, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          {i > 0 && <span style={{ color: 'var(--text-3)', margin: '0 1px', fontFamily: 'var(--font-mono)' }}>:</span>}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color, fontWeight: 700 }}>{pad(val)}</span>
        </span>
      ))}
    </div>
  );
}
