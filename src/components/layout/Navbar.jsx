import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useRoundStore } from '../../store/roundStore';
import { useState, useEffect, useRef } from 'react';
import CountdownTimer from '../ui/CountdownTimer';
import { notifications as notificationsApi } from '../../services/api';

const NAV_LINKS = [
  { to: '/dreamboard', label: 'Dreamboard' },
  { to: '/arena',      label: 'Arena' },
  { to: '/hall',       label: 'Hall' },
  { to: '/graveyard',  label: 'Graveyard' },
  { to: '/well',       label: 'Wishing Well' },
];

const NOTIF_ICONS = {
  belief_received:  '🔥',
  rank_change:      '🏆',
  round_won:        '👑',
  believer_won:     '👑',
  comment_received: '💬',
};

function formatNotif(n) {
  switch (n.type) {
    case 'belief_received':  return `@${n.fromUsername} believed in "${n.dreamTitle}"`;
    case 'rank_change':      return `"${n.dreamTitle}" is now ranked #1 🚀`;
    case 'round_won':        return `You won! "${n.dreamTitle}" — ◎${n.solAmount?.toFixed(4) || '?'}`;
    case 'believer_won':     return `You backed the winner: "${n.dreamTitle}" — ◎${n.solAmount?.toFixed(4) || '?'}`;
    case 'comment_received': return `@${n.fromUsername} commented on your dream`;
    default:                 return 'New notification';
  }
}

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

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const { currentRound, potSOL } = useRoundStore();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifList,   setNotifList]   = useState([]);
  const [panelOpen,   setPanelOpen]   = useState(false);
  const bellRef = useRef(null);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const { notifications } = await notificationsApi.get();
      setNotifList(notifications || []);
      setUnreadCount((notifications || []).filter(n => !n.read).length);
    } catch {}
  };

  useEffect(() => {
    if (!user) { setUnreadCount(0); setNotifList([]); return; }
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 60000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!panelOpen) return;
    const handleClick = e => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setPanelOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [panelOpen]);

  const handleNotifClick = async notif => {
    setPanelOpen(false);
    if (notif.dreamId) navigate('/dreams/' + notif.dreamId);
    try {
      await notificationsApi.markRead();
      setUnreadCount(0);
      setNotifList(list => list.map(n => ({ ...n, read: true })));
    } catch {}
  };

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const linkStyle = ({ isActive }) => ({
    color: isActive ? 'var(--gold)' : 'var(--text-2)',
    fontSize: '0.8rem', fontWeight: 500, transition: 'color 0.18s',
    textDecoration: 'none', letterSpacing: '0.01em',
  });

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 64,
      background: scrolled ? 'rgba(0,0,8,0.88)' : 'transparent',
      backdropFilter: scrolled ? 'blur(28px) saturate(180%)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(28px) saturate(180%)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
      transition: 'all 0.3s',
    }}>
      <div style={{
        maxWidth: 1300, margin: '0 auto', padding: '0 24px',
        height: '100%', display: 'flex', alignItems: 'center', gap: 20,
      }}>
        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg, #FFD700, #FF9900, #FF0080)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.88rem', fontWeight: 900, color: '#000',
            fontFamily: 'var(--font-display)',
            boxShadow: '0 0 20px rgba(255,215,0,0.4)',
          }}>1</div>
          <span className="hide-mobile" style={{
            fontFamily: 'var(--font-display)', fontSize: '0.7rem', fontWeight: 700,
            letterSpacing: '0.1em', color: 'var(--text)',
          }}>SOL & A DREAM</span>
        </Link>

        {/* Nav links */}
        <div className="hide-mobile" style={{ display: 'flex', gap: 18, flex: 1 }}>
          {NAV_LINKS.map(l => (
            <NavLink key={l.to} to={l.to} style={linkStyle}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = ''; }}
            >{l.label}</NavLink>
          ))}
        </div>

        {/* Notification bell */}
        {user && (
          <div ref={bellRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setPanelOpen(p => !p)}
              style={{
                position: 'relative', width: 34, height: 34, borderRadius: '50%',
                background: panelOpen ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.09)',
                cursor: 'pointer', fontSize: '0.9rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              🔔
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -3, right: -3,
                  background: 'var(--fading)', color: '#fff',
                  borderRadius: '50%', fontSize: '0.55rem', fontWeight: 700,
                  width: 16, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #000508',
                }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>

            {panelOpen && (
              <div style={{
                position: 'absolute', top: 44, right: 0, width: 340, maxHeight: 480,
                background: 'rgba(5,7,18,0.97)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
                backdropFilter: 'blur(24px)',
                zIndex: 200,
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    Notifications
                  </p>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 424 }}>
                  {notifList.length === 0 && (
                    <p style={{ padding: '20px 16px', color: 'var(--text-3)', fontSize: '0.82rem' }}>
                      No notifications yet.
                    </p>
                  )}
                  {notifList.map(n => (
                    <div
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        background: n.read ? 'transparent' : 'rgba(255,215,0,0.04)',
                        borderLeft: n.read ? '2px solid transparent' : '2px solid rgba(255,215,0,0.35)',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(255,215,0,0.04)'; }}
                    >
                      <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>
                        {NOTIF_ICONS[n.type] || '🔔'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.4, marginBottom: 3, wordBreak: 'break-word' }}>
                          {formatNotif(n)}
                        </p>
                        <p style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                          {timeAgo(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Round pill */}
        {currentRound && (
          <div className="navbar-round-pill" style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 'var(--r-full)', padding: '5px 14px',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            backdropFilter: 'blur(12px)',
          }}>
            <span style={{ color: 'var(--gold)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              ◎ {typeof potSOL === 'number' ? potSOL.toFixed(2) : '0.00'}
            </span>
            <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.12)' }} />
            <CountdownTimer endsAt={currentRound.endsAt} compact />
          </div>
        )}

        {/* Auth */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {user ? (
            <>
              <Link to={`/profile/${user.walletAddress}`} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 'var(--r-full)', padding: '5px 12px 5px 6px',
                fontSize: '0.8rem', color: 'var(--text)', backdropFilter: 'blur(10px)',
                transition: 'background 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              >
                {user.profilePicUrl
                  ? <img src={user.profilePicUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: `linear-gradient(135deg, hsl(${(user.walletAddress?.charCodeAt(0)||0)*7%360},70%,55%), hsl(${(user.walletAddress?.charCodeAt(2)||0)*11%360},70%,45%))`,
                    }} />
                }
                <span className="hide-mobile">{user.username}</span>
              </Link>
              <button onClick={() => { logout(); navigate('/'); }} className="btn btn-ghost btn-sm">Out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm hide-mobile">Login</Link>
              <Link to="/signup" className="btn btn-primary btn-sm">Join</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
