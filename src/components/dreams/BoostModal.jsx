import { useState, useEffect } from 'react';
import { config as configApi, beliefs as beliefApi } from '../../services/api';

const BOOST_PLACEHOLDERS = [
  { icon: '🔦', name: 'Spotlight', desc: 'Pin your dream to the top of the Dreamboard for 1 hour.' },
  { icon: '🌈', name: 'Color Burst', desc: 'Unlock a unique animated border color for your card.' },
  { icon: '📣', name: 'Megaphone', desc: 'Broadcast your dream to all active users in real time.' },
];

export default function BoostModal({ open, onClose, dream }) {
  const [tab, setTab]             = useState(0);
  const [cfg, setCfg]             = useState(null);
  const [myBeliefs, setMyBeliefs] = useState(null);
  const [checking, setChecking]   = useState(false);
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(0);
    configApi.get().then(setCfg).catch(() => {});
    beliefApi.my().then(d => setMyBeliefs(d)).catch(() => {});
  }, [open]);

  const handleCheckSent = async () => {
    setChecking(true);
    try {
      const d = await beliefApi.my();
      setMyBeliefs(d);
    } finally { setChecking(false); }
  };

  const copyWallet = () => {
    if (!cfg?.creatorWallet) return;
    navigator.clipboard.writeText(cfg.creatorWallet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!open) return null;

  const purchased = myBeliefs?.purchasedBeliefs || 0;
  const slots = cfg ? [
    { slot: 4, label: '4th Belief Slot', tokens: cfg.beliefCosts.fourth, unlocked: purchased >= 1 },
    { slot: 5, label: '5th Belief Slot', tokens: cfg.beliefCosts.fifth,  unlocked: purchased >= 2 },
    { slot: 6, label: '6th Belief Slot', tokens: cfg.beliefCosts.sixth,  unlocked: purchased >= 3 },
  ] : [];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px 16px',
        animation: 'scale-in 0.2s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'rgba(8,6,20,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 'var(--r-xl)',
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 40px 100px rgba(0,0,0,0.7)',
          animation: 'fade-up 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '22px 24px 0',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 900,
                fontSize: '0.95rem', letterSpacing: '-0.02em', marginBottom: 3,
              }}>⚡ Boost</h2>
              {dream && (
                <p style={{
                  fontSize: '0.72rem', color: 'var(--text-3)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  maxWidth: 300,
                }}>"{dream.title}"</p>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-2)', fontSize: '0.9rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'background 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            >✕</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {['Extra Beliefs', 'Boosts'].map((label, i) => (
              <button
                key={label}
                onClick={() => setTab(i)}
                style={{
                  padding: '9px 18px', fontSize: '0.78rem', fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: tab === i ? 'var(--text)' : 'var(--text-3)',
                  borderBottom: tab === i ? '2px solid var(--gold)' : '2px solid transparent',
                  transition: 'color 0.15s, border-color 0.15s',
                  marginBottom: -1,
                }}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Tab: Extra Beliefs */}
        {tab === 0 && (
          <div style={{ padding: '22px 24px 24px' }}>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 20 }}>
              You get 3 free beliefs per round. Unlock more by sending tokens to the creator wallet.
              Your slot unlocks automatically within 30 seconds of the transaction confirming.
            </p>

            {/* Slot options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
              {slots.length === 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--gold)', animation: 'spin 0.7s linear infinite' }} />
                </div>
              )}
              {slots.map(({ slot, label, tokens, unlocked }) => (
                <div key={slot} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px', borderRadius: 'var(--r-md)',
                  background: unlocked ? 'rgba(0,255,209,0.06)' : 'rgba(255,255,255,0.03)',
                  border: unlocked
                    ? '1px solid rgba(0,255,209,0.22)'
                    : '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: unlocked ? 'rgba(0,255,209,0.1)' : 'rgba(255,255,255,0.04)',
                    border: unlocked ? '1px solid rgba(0,255,209,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.78rem',
                    color: unlocked ? 'var(--alive)' : 'var(--text-3)',
                  }}>{unlocked ? '✓' : slot}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '0.82rem', fontWeight: 600,
                      color: unlocked ? 'var(--alive)' : 'var(--text)',
                      marginBottom: 2,
                    }}>{label}</p>
                    <p style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                      color: unlocked ? 'rgba(0,255,209,0.6)' : 'var(--text-3)',
                    }}>
                      {unlocked ? 'Unlocked ✓' : `Send ${tokens.toLocaleString()} tokens`}
                    </p>
                  </div>

                  {!unlocked && (
                    <span style={{
                      fontFamily: 'var(--font-display)', fontWeight: 900,
                      fontSize: '0.85rem', color: 'var(--gold)',
                      flexShrink: 0,
                    }}>{tokens.toLocaleString()}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Creator wallet address */}
            {cfg?.creatorWallet && (
              <div style={{ marginBottom: 20 }}>
                <p style={{
                  fontSize: '0.66rem', fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'var(--text-3)', marginBottom: 8,
                }}>Send tokens to this address</p>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 'var(--r-md)',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <p style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                    color: 'var(--text-2)', flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    letterSpacing: '0.02em',
                  }}>{cfg.creatorWallet}</p>
                  <button
                    onClick={copyWallet}
                    style={{
                      padding: '4px 10px', borderRadius: 6, flexShrink: 0,
                      background: copied ? 'rgba(0,255,209,0.12)' : 'rgba(255,255,255,0.06)',
                      border: copied ? '1px solid rgba(0,255,209,0.3)' : '1px solid rgba(255,255,255,0.1)',
                      color: copied ? 'var(--alive)' : 'var(--text-2)',
                      fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >{copied ? '✓ Copied' : 'Copy'}</button>
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 8, lineHeight: 1.55 }}>
                  Send the <strong style={{ color: 'var(--text-2)' }}>exact amount</strong> from the wallet linked to your account.
                  Slots unlock automatically within 30 seconds.
                </p>
              </div>
            )}

            {/* Refresh button */}
            <button
              onClick={handleCheckSent}
              disabled={checking}
              className="btn btn-ghost"
              style={{ width: '100%', fontSize: '0.82rem', gap: 8 }}
            >
              {checking ? (
                <>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--text)', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                  Checking...
                </>
              ) : "I've sent it — check my slots"}
            </button>
          </div>
        )}

        {/* Tab: Boosts (placeholder) */}
        {tab === 1 && (
          <div style={{ padding: '28px 24px 32px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 99,
              background: 'rgba(191,95,255,0.08)',
              border: '1px solid rgba(191,95,255,0.2)',
              fontSize: '0.6rem', fontFamily: 'var(--font-mono)',
              letterSpacing: '0.14em', color: 'var(--resurrected)',
              marginBottom: 20,
            }}>COMING SOON</div>

            <h3 style={{
              fontFamily: 'var(--font-display)', fontWeight: 900,
              fontSize: '0.88rem', letterSpacing: '-0.02em', marginBottom: 8,
            }}>Dream Boosts</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 28 }}>
              Spend tokens to amplify your dream's visibility. Boosts burn tokens — they don't add to the prize pool.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {BOOST_PLACEHOLDERS.map(({ icon, name, desc }) => (
                <div key={name} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  padding: '14px 16px', borderRadius: 'var(--r-md)',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  opacity: 0.6,
                }}>
                  <span style={{ fontSize: '1.4rem', flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <div>
                    <p style={{ fontSize: '0.84rem', fontWeight: 600, marginBottom: 4 }}>{name}</p>
                    <p style={{ fontSize: '0.76rem', color: 'var(--text-3)', lineHeight: 1.5 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
