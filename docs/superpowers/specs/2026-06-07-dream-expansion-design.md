# Dream Expansion — Design Spec
_Date: 2026-06-07_

## Overview

Ten coordinated changes to "1 SOL and a Dream": AI title generation, an expanded dream schema, comments, notifications, a dream detail page, and a notification bell in the navbar.

---

## Backend (server.js)

### New helper: `postJSON(url, headers, body)`
Native `https.request` wrapper for POST calls. Mirrors existing `fetchJSON` (GET). Needed for the Anthropic API call.

### New endpoint: `GET /api/dreams/:id`
No auth required. Fetches single dream doc from Firestore by ID. Returns `{ dream }` or 404.

### Task 1 — `POST /api/dreams/generate-title` (auth required)
- Body: `{ dreamText }`
- Calls `api.anthropic.com/v1/messages` via `postJSON`
- API key: `process.env.ANTHROPIC_API`
- Model: `claude-haiku-4-5-20251001`
- Prompt: generate a short poetic title (max 8 words, no quotes, no trailing punctuation) that captures the soul of the dream
- Returns `{ title }`

### Task 2 — Updated dream schema

**`POST /api/dreams`** now accepts and stores:
| Field | Type | Constraint | Required |
|-------|------|-----------|---------|
| `body` | string | no char limit | yes |
| `title` | string | max 12 words | yes |
| `images` | string[] | up to 3 URLs | no |
| `links` | `{platform, url}`[] | up to 3 | no |
| `commentCount` | number | starts at 0 | — |

Removed: `proofImageUrl`, `proofLink`.

**`PUT /api/dreams/:id`** updated identically — accepts `body`, `title` (12-word limit), `images`, `links`. Removes `proofImageUrl`/`proofLink` handling.

### Task 3 — Comments (`dream_comments` collection)

**`GET /api/dreams/:id/comments`** — no auth
- Returns comments ordered by `createdAt ASC`, limit 100
- Returns `{ comments: [...] }`

**`POST /api/dreams/:id/comments`** — auth required
- Body: `{ text }` (max 500 chars)
- Stores: `dreamId`, `userId`, `username`, `profilePicUrl`, `text`, `createdAt`
- Increments `commentCount` on dream doc (FieldValue.increment)
- Calls `notify(dream.userId, 'comment_received', { fromUsername, dreamTitle, dreamId })` unless commenter === dream owner

### Task 4 — Notifications (`dream_notifications` collection)

**`notify(userId, type, data)`** helper — writes `{ userId, type, read: false, createdAt, ...data }`.

**Hook points:**
1. `POST /api/beliefs/:dreamId` — after batch commit:
   - `notify(dream.userId, 'belief_received', { fromUsername, dreamTitle: dream.title, dreamId })`
   - Skip if believer === dream owner
   - Check rank: query `dreams` orderBy `beliefCount desc` limit 1; if result is this dream AND no existing `rank_change` notification for this `dreamId` → `notify(dream.userId, 'rank_change', { dreamId, dreamTitle: dream.title })`
2. `closeRound` — after payouts:
   - `notify(first.userId, 'round_won', { dreamId: first.id, dreamTitle: first.title, solAmount: payouts[first.walletAddress] || 0 })`
   - For each unique believer: `notify(believerUserId, 'believer_won', { dreamId: first.id, dreamTitle: first.title, solAmount: share })`
   - Note: `dream_beliefs_log` stores both `walletAddress` and `userId` — use `userId` directly from the log docs, no lookup needed
3. `POST /api/dreams/:id/comments` — `notify(dream.userId, 'comment_received', { fromUsername, dreamId })`

**`GET /api/notifications`** — auth required
- Returns last 30 notifications for `req.user.userId` ordered `createdAt DESC`
- Returns `{ notifications: [...] }`

**`PUT /api/notifications/read`** — auth required
- Batch-updates all `read: false` docs for user to `read: true`
- Returns `{ success: true }`

### Task 5 — Required Firestore indexes (tell user to create manually)

In Firebase Console → Firestore → Indexes → Composite:
- `dream_comments`: `dreamId ASC` · `createdAt ASC`
- `dream_notifications`: `userId ASC` · `createdAt DESC`
- `dream_notifications`: `userId ASC` · `read ASC`

---

## Frontend

### Task 10 — `src/services/api.js` additions

```js
// add to dreams:
generateTitle: (dreamText) => api.post('/api/dreams/generate-title', { dreamText }).then(r => r.data),
get:          (id)         => api.get(`/api/dreams/${id}`).then(r => r.data),
getComments:  (dreamId)    => api.get(`/api/dreams/${dreamId}/comments`).then(r => r.data),
postComment:  (dreamId, text) => api.post(`/api/dreams/${dreamId}/comments`, { text }).then(r => r.data),

// new export:
export const notifications = {
  get:      () => api.get('/api/notifications').then(r => r.data),
  markRead: () => api.put('/api/notifications/read').then(r => r.data),
};
```

### `src/services/firebase.js` addition

```js
export function listenComments(dreamId, cb) {
  const q = query(
    collection(init(), 'dream_comments'),
    where('dreamId', '==', dreamId),
    orderBy('createdAt', 'asc'),
    limit(100)
  );
  return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}
```

### Task 6 — `PostDreamModal.jsx` rewrite

Single scrollable form, no step wizard — just vertical sections:

1. **Body** — large `<textarea>` with autogrow (via `onInput` setting `style.height = scrollHeight`). Placeholder: "Write your dream. Tell the story. Why this dream, why you, why now. Take as much space as you need." Required.

2. **Title** — `<input>` with word count `X/12 words` (red when over). "Generate ✦" button: disabled until body has text; shows spinner while loading; calls `dreams.generateTitle(body)` and fills input. "Regenerate ↺" button: appears after first generation; same behavior. User may freely edit or ignore AI entirely.

3. **Images** — three `<input placeholder="Image URL">` fields, all optional. Saved as `images` array (filter empty strings before submit).

4. **Links** — three rows. Each row:
   - Quick-pick buttons: X, Website, Instagram, TikTok, YouTube — clicking sets `platform` string for that row
   - Text input for custom platform name (populated by quick-pick or typed freely)
   - URL input
   - Only rows where both `platform` and `url` are non-empty are included in `links` array

5. **Mood** — existing mood selector unchanged

Submit sends `{ body, title, images, links, mood }`.

State shape:
```js
{
  body: '',
  title: '',
  titleLoading: false,
  titleGenerated: false,
  images: ['', '', ''],
  links: [
    { platform: '', url: '' },
    { platform: '', url: '' },
    { platform: '', url: '' },
  ],
  mood: '',
}
```

### Task 7 — `DreamCard.jsx` targeted updates

Full card (non-compact) changes only:
- If `dream.images?.[0]`: render as an absolutely-positioned `<img>` inside the art zone with `object-fit: cover`, `opacity: 0.15`, `filter: blur(8px)`, full width/height, `z-index: 0`. Content sits on `z-index: 1`.
- In the art zone, below the title: render body preview — `(dream.body || '').slice(0, 80)` + ellipsis if longer. Faded small text (`fontSize: '0.46rem'`, `color: 'var(--text-3)'`).
- Stats grid: replace the current "Rank" stat cell with a comment count cell (`💬 {dream.commentCount || 0}`) when `rank` prop is not provided; keep rank cell when rank IS provided. To fit both when rank exists, stack rank + comments in the same cell (small rank label + even smaller comment count below it).
- Wrap the entire card `<div>` in `<Link to={/dreams/${dream.id}} style={{ textDecoration: 'none' }}>`. The profile link and boost/believe buttons inside use `e.stopPropagation()` (already in place for boost).

### Task 8 — `src/pages/DreamDetail.jsx` (new)

Route: `/dreams/:id`

**Data sources:**
- Dream: `listenDream(id, cb)` from `firebase.js` (real-time)
- Comments: `listenComments(id, cb)` from `firebase.js` (real-time)
- Believers: one-time query on mount — `getDb()` → query `dream_beliefs_log` where `dreamId == id` AND `roundId == dream.roundId`, get unique `userId`/`username`/`profilePicUrl`

**Layout (top to bottom):**
1. Back button (`← Back`)
2. Title — large, `fontFamily: var(--font-display)`, italic, fontStyle italic
3. Meta row — author avatar + username, mood badge, belief count, comment count
4. Image gallery — horizontal scrollable row of `<img>` tags, `height: 220px`, `objectFit: cover`, `borderRadius: 10`, only rendered if `dream.images?.length`
5. Link pills — `dream.links` rendered as `<a target="_blank" rel="noopener noreferrer">` pill badges. Platform icons: `X → 𝕏`, `Website → 🌐`, `Instagram → 📸`, `TikTok → 🎵`, `YouTube → ▶`, others → `🔗`
6. Full body — `<p style={{ whiteSpace: 'pre-wrap' }}>{dream.body}</p>`
7. Believers section — grid of avatar circles + `@username` labels (fetched once)
8. Comments section — real-time list. Each comment: avatar, username, text, time-ago. Comment input at bottom for logged-in users; "Sign in to comment" link for guests.

**`App.jsx`** — add:
```jsx
import DreamDetail from './pages/DreamDetail';
// inside <Route element={<Layout />}>:
<Route path="/dreams/:id" element={<DreamDetail />} />
```

### Task 9 — `Navbar.jsx` notification bell

**State:** `unreadCount` (number), `notifications` (array), `panelOpen` (bool).

**On mount:** call `notifications.get()`, compute unread count. Set interval (60s) to refresh unread count.

**Bell button** — positioned after nav links, before the round pill. Shows `🔔` with a red badge `<span>` absolutely positioned top-right of the button when `unreadCount > 0`.

**Dropdown panel** — absolutely positioned below bell, `width: 340px`, max-height 480px, scrollable. Renders each notification:
- Icon: `🔥` belief_received, `🏆` rank_change, `👑` round_won / believer_won, `💬` comment_received
- Message: human-readable string derived from `type` + `data` fields
- Time: simple time-ago (seconds → "just now", minutes → "Xm ago", hours → "Xh ago", days → "Xd ago")
- Unread highlight: `background: rgba(255,215,0,0.05)`, `borderLeft: '2px solid rgba(255,215,0,0.4)'`

**On notification click:** `navigate('/dreams/' + notif.dreamId)`, call `notifications.markRead()`, set `unreadCount` to 0, close panel.

**Click-outside:** `useEffect` adds `mousedown` listener on `document` that closes panel if click is outside ref.

---

## Files changed/created

| File | Action |
|------|--------|
| `server.js` | add `postJSON`, `GET /api/dreams/:id`, `POST /api/dreams/generate-title`, update `POST/PUT /api/dreams`, add `dream_comments` endpoints, add `notify()` + hooks, add notification endpoints |
| `src/services/api.js` | add `dreams.generateTitle`, `dreams.get`, `dreams.getComments`, `dreams.postComment`, new `notifications` export |
| `src/services/firebase.js` | add `listenComments` |
| `src/components/dreams/PostDreamModal.jsx` | full rewrite |
| `src/components/dreams/DreamCard.jsx` | targeted updates |
| `src/pages/DreamDetail.jsx` | new file |
| `src/components/layout/Navbar.jsx` | add notification bell |
| `src/App.jsx` | add `/dreams/:id` route |

---

## Open questions resolved

- Dream detail = dedicated page at `/dreams/:id`, not a modal
- `PUT /api/dreams/:id` updated to accept new fields, drops `proofImageUrl`/`proofLink`
- `closeRound` believers notification: `dream_beliefs_log` already stores `userId` — use directly
- Rank-change deduplication: query `dream_notifications` for existing `type == 'rank_change'` + `dreamId` before writing
