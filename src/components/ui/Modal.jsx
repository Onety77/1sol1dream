import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, maxWidth = 540, footer }) {
  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        background: 'rgba(0,0,8,0.85)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        overflowY: 'auto',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'clamp(8px, 3vw, 16px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(8,0,20,0.96)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 'var(--r-xl)',
          width: '100%', maxWidth,
          maxHeight: 'calc(100% - clamp(16px, 3vw, 32px))',
          margin: 'auto',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 40px 120px rgba(0,0,0,0.9)',
          animation: 'scale-in 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {/* Top shimmer line */}
        <div style={{
          position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.5), transparent)',
          pointerEvents: 'none', zIndex: 1,
        }} />

        {/* Sticky header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: 'clamp(18px, 3vw, 26px) clamp(22px, 4vw, 32px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: '0.92rem', fontWeight: 700,
            letterSpacing: '-0.01em',
          }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 'var(--r-md)',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.1rem', cursor: 'pointer', transition: 'background 0.2s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          >×</button>
        </div>

        {/* Scrollable body */}
        <div style={{
          overflowY: 'auto', flex: 1,
          padding: 'clamp(18px, 3vw, 26px) clamp(22px, 4vw, 32px)',
        }}>
          {children}
        </div>

        {/* Sticky footer (optional) */}
        {footer && (
          <div style={{
            flexShrink: 0,
            padding: 'clamp(14px, 2vw, 18px) clamp(22px, 4vw, 32px)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(8,0,20,0.98)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
