import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dreams as dreamsApi, beliefs as beliefApi } from '../services/api';
import { useRoundStore } from '../store/roundStore';
import { useAuthStore } from '../store/authStore';
import CountdownTimer from '../components/ui/CountdownTimer';
import DreamCard from '../components/dreams/DreamCard';
import FeaturedDreamCard from '../components/dreams/FeaturedDreamCard';

export default function Arena() {
  const { currentRound, potSOL } = useRoundStore();
  const { user } = useAuthStore();
  const [topDreams, setTopDreams] = useState([]);
  const [myBeliefs, setMyBeliefs] = useState([]);
  const [loading, setLoading] = useState(true);

  const timeLeft = (() => {
    if (!currentRound?.endsAt) return null;
    const end = currentRound.endsAt?.toDate ? currentRound.endsAt.toDate()
      : currentRound.endsAt?.seconds ? new Date(currentRound.endsAt.seconds * 1000)
      : new Date(currentRound.endsAt);
    return end - Date.now();
  })();
  const isFinalHour = timeLeft !== null && timeLeft < 600000 && timeLeft > 0;

  const refreshBeliefs = () =>
    beliefApi.my().then(d => setMyBeliefs(d.beliefs || [])).catch(() => {});

  useEffect(() => {
    dreamsApi.top()
      .then(d => { setTopDreams(d.dreams || []); setLoading(false); })
      .catch(() => setLoading(false));
    if (user) refreshBeliefs();
  }, [user]);

  return (
    <div style={{
      minHeight: '100vh',
      paddingTop: 72,
      paddingBottom: 100,
      background: isFinalHour
        ? 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,31,90,0.07) 0%, transparent 60%)'
        : 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,215,0,0.04) 0%, transparent 60%)',
    }}>

      {/* ── Page header ── */}
      <div style={{ padding: 'clamp(36px,5vw,56px) 0 clamp(28px,4vw,40px)', textAlign: 'center' }}>
        <div className="container">

          {isFinalHour && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              marginBottom: 20, padding: '7px 18px',
              background: 'rgba(255,31,90,0.1)', border: '1px solid rgba(255,31,90,0.4)',
              borderRadius: 'var(--r-full)', fontSize: '0.78rem',
              color: 'var(--fading)', fontWeight: 700, letterSpacing: '0.05em',
              animation: 'fading-breathe 1.5s ease-in-out infinite',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fading)', animation: 'blink 1s ease-in-out infinite' }} />
              FINAL HOUR — Beliefs locking soon
            </div>
          )}

          <p className="section-label" style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            Round #{currentRound?.roundNumber || '—'}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 900,
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            letterSpacing: '-0.04em', marginBottom: 10,
          }}>The Arena</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginBottom: 24 }}>
            Top dreams competing right now. Round closes in:
          </p>

          {currentRound && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
              <CountdownTimer endsAt={currentRound.endsAt} large />
            </div>
          )}

          {/* Stats strip */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 0, justifyContent: 'center',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--r-xl)', overflow: 'hidden',
            backdropFilter: 'blur(20px)',
          }}>
            <div style={{ padding: '14px 28px', textAlign: 'center' }}>
              <p className="section-label" style={{ marginBottom: 5 }}>Prize Pool</p>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 900,
                fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                color: 'var(--gold)', lineHeight: 1,
                animation: 'gold-pulse 2.5s ease-in-out infinite',
              }}>◎ {potSOL.toFixed(2)}</p>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch' }} />
            <div style={{ padding: '14px 28px', textAlign: 'center' }}>
              <p className="section-label" style={{ marginBottom: 5 }}>Dreams Fighting</p>
              <p style={{
                fontFamily: 'var(--font-display)', fontWeight: 900,
                fontSize: 'clamp(1.4rem, 3vw, 2rem)', lineHeight: 1,
              }}>{topDreams.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Dream content ── */}
      <div className="container" style={{ paddingBottom: 48 }}>

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="skeleton" style={{ height: 300, borderRadius: 22 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 20 }}>
              {[0,1,2].map(i => (
                <div key={i} className="skeleton" style={{ aspectRatio: '2.5/3.5', maxWidth: 260, borderRadius: 18 }} />
              ))}
            </div>
          </div>
        )}

        {/* Empty */}
        {!loading && topDreams.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{
              fontFamily: 'var(--font-display)', fontSize: '1.4rem',
              color: 'var(--text-3)', letterSpacing: '-0.02em',
            }}>The arena is empty.<br />No dreams this round yet.</p>
          </div>
        )}

        {!loading && topDreams.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

            {/* ── #1: Featured widescreen card ── */}
            {topDreams[0] && (
              <FeaturedDreamCard
                dream={topDreams[0]}
                myBeliefs={myBeliefs}
                onBelief={refreshBeliefs}
                rank={1}
              />
            )}

            {/* ── #2 and #3: Artifact cards, 2-col ── */}
            {topDreams.slice(1, 3).length > 0 && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  margin: '-8px 0 0',
                }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                  <p className="section-label">Chasing the lead</p>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                </div>
                <div className="dream-card-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 260px))',
                  gap: 24, justifyContent: 'center',
                }}>
                  {topDreams.slice(1, 3).map((d, i) => (
                    <DreamCard
                      key={d.id}
                      dream={d}
                      myBeliefs={myBeliefs}
                      onBelief={refreshBeliefs}
                      rank={i + 2}
                    />
                  ))}
                </div>
              </>
            )}

            {/* ── #4–10: Compact strips ── */}
            {topDreams.slice(3).length > 0 && (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
                }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                  <p className="section-label">The rest of the field</p>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {topDreams.slice(3).map((d, i) => (
                    <DreamCard
                      key={d.id}
                      dream={d}
                      myBeliefs={myBeliefs}
                      onBelief={() => {}}
                      rank={i + 4}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
