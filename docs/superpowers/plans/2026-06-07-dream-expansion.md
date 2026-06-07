# Dream Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI title generation, expanded dream schema (body/images/links), comments, notifications, a dream detail page, and a notification bell to the navbar.

**Architecture:** All backend changes land in `server.js` (single-file Express + engine). Frontend changes touch 5 existing files and add 2 new ones (`DreamDetail.jsx` + the new route). The Firestore client SDK (`firebase.js`) handles real-time comment listening; REST endpoints handle everything else.

**Tech Stack:** Node.js/Express, Firebase Admin SDK (backend), Firebase JS SDK (frontend real-time), React + Vite, axios, react-router-dom v6.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `server.js` | Modify | Add `postJSON`, `GET /api/dreams/:id`, `POST /api/dreams/generate-title`, update `POST/PUT /api/dreams`, add comments endpoints, add `notify()` + notification endpoints, hook notify into beliefs + closeRound |
| `src/services/api.js` | Modify | Add `dreams.generateTitle`, `dreams.get`, `dreams.getComments`, `dreams.postComment`, new `notifications` export |
| `src/services/firebase.js` | Modify | Add `listenComments(dreamId, cb)` |
| `src/components/dreams/PostDreamModal.jsx` | Full rewrite | New multi-section form with AI title, body textarea, images, links |
| `src/components/dreams/DreamCard.jsx` | Modify | Card navigates to detail, image bg, body preview, commentCount |
| `src/pages/DreamDetail.jsx` | Create | Full dream detail page with comments + believers |
| `src/components/layout/Navbar.jsx` | Modify | Notification bell with dropdown |
| `src/App.jsx` | Modify | Add `/dreams/:id` route |

---

## Task 1: `postJSON` helper + `GET /api/dreams/:id`

**Files:**
- Modify: `server.js` (after line 58, after line ~284)

- [ ] **Step 1: Add `postJSON` after `fetchJSON`**

In `server.js`, after the closing `}` of `fetchJSON` (after line 58), insert:

```js
function postJSON(url, headers = {}, body = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed  = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
    };
    const req = https.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(new Error("parse")); } });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });
    req.write(payload);
    req.end();
  });
}
```

- [ ] **Step 2: Add `GET /api/dreams/:id` after `GET /api/dreams/graveyard`**

In `server.js`, after the closing `});` of `app.get("/api/dreams/graveyard"` (around line 284), insert:

```js
app.get("/api/dreams/:id", async (req, res) => {
  try {
    const snap = await db.collection("dreams").doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: "Dream not found" });
    res.json({ dream: { id: snap.id, ...snap.data() } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

- [ ] **Step 3: Verify with curl**

```bash
# Replace with a real dream ID from your Firestore
curl https://1sol1dream-production.up.railway.app/api/dreams/SOME_DREAM_ID
# Expected: { "dream": { "id": "...", "title": "...", ... } }

curl https://1sol1dream-production.up.railway.app/api/dreams/nonexistent
# Expected: 404 { "error": "Dream not found" }
```

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add postJSON helper and GET /api/dreams/:id"
```

---

## Task 2: `POST /api/dreams/generate-title`

**Files:**
- Modify: `server.js` (before `app.post("/api/dreams"`)

- [ ] **Step 1: Insert the endpoint before `app.post("/api/dreams"`**

In `server.js`, immediately before `app.post("/api/dreams", auth, holder,` insert:

```js
app.post("/api/dreams/generate-title", auth, async (req, res) => {
  try {
    const { dreamText } = req.body;
    if (!dreamText?.trim()) return res.status(400).json({ error: "dreamText required" });

    const result = await postJSON(
      "https://api.anthropic.com/v1/messages",
      {
        "x-api-key":          process.env.ANTHROPIC_API,
        "anthropic-version":  "2023-06-01",
      },
      {
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [{
          role:    "user",
          content: `Generate a short poetic title (maximum 8 words, no quotes, no punctuation at the end) that captures the soul of this dream:\n\n${dreamText.slice(0, 2000)}`,
        }],
      }
    );

    const title = result?.content?.[0]?.text?.trim() || "A Dream Worth Believing";
    res.json({ title });
  } catch (e) {
    log(`[generate-title] error: ${e.message}`);
    res.status(500).json({ error: "Failed to generate title" });
  }
});
```

- [ ] **Step 2: Verify**

```bash
# Need auth token — get one from localStorage in browser devtools after logging in
TOKEN="your_jwt_token"
curl -X POST https://1sol1dream-production.up.railway.app/api/dreams/generate-title \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"dreamText":"I want to build a decentralized social platform for dreamers around the world where everyone can share their vision and receive support from believers."}'
# Expected: { "title": "A short poetic title here" }
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add POST /api/dreams/generate-title using Anthropic API"
```

---

## Task 3: Update `POST /api/dreams` schema

**Files:**
- Modify: `server.js` — the `app.post("/api/dreams"` handler (lines ~286–329)

- [ ] **Step 1: Replace the handler body**

Replace the entire `app.post("/api/dreams", auth, holder, async (req, res) => { ... });` with:

```js
app.post("/api/dreams", auth, holder, async (req, res) => {
  try {
    const { title, body, mood, images, links } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Title required" });
    if (!body?.trim())  return res.status(400).json({ error: "Body required" });
    const words = title.trim().split(/\s+/).filter(Boolean).length;
    if (words > 12) return res.status(400).json({ error: "Title must be 12 words or fewer" });

    const safeImages = Array.isArray(images)
      ? images.filter(u => typeof u === "string" && u.trim()).slice(0, 3).map(u => u.trim())
      : [];
    const safeLinks = Array.isArray(links)
      ? links.filter(l => l?.platform && l?.url).slice(0, 3)
          .map(l => ({ platform: String(l.platform).trim(), url: String(l.url).trim() }))
      : [];

    const existing = await db.collection("dreams")
      .where("walletAddress", "==", req.user.walletAddress)
      .where("isDeleted", "==", false).where("isRetired", "==", false).limit(1).get();
    if (!existing.empty) return res.status(409).json({ error: "You already have an active dream. Delete it first." });

    const roundSnap = await db.doc("dream_stats/currentRound").get();
    if (!roundSnap.exists) return res.status(503).json({ error: "No active round yet. Try again shortly." });
    const { roundId } = roundSnap.data();

    const userSnap = await db.collection("dream_users").doc(req.user.userId).get();
    const user = userSnap.data();
    const now  = Timestamp.now();
    const ref  = db.collection("dreams").doc();

    const dream = {
      id: ref.id, userId: req.user.userId,
      walletAddress: req.user.walletAddress,
      username: user.username,
      profilePicUrl: user.profilePicUrl || "",
      title: title.trim(),
      body: body.trim(),
      images: safeImages,
      links: safeLinks,
      mood: mood || "Serious",
      commentCount: 0,
      state: "alive", beliefCount: 0, recentBeliefs: 0,
      roundId, isRetired: false, isDeleted: false, deleteCount: 0,
      titleLockedAt: Timestamp.fromMillis(Date.now() + 1800000),
      createdAt: now, updatedAt: now,
    };
    await ref.set(dream);
    await db.doc("dream_stats/global").set({ totalDreams: FieldValue.increment(1) }, { merge: true });
    await db.collection("dream_users").doc(req.user.userId).update({ roundsParticipated: FieldValue.increment(1) });
    res.status(201).json({ dream: { id: ref.id, ...dream } });
    log(`[dream] "${title.slice(0, 40)}" by ${user.username}`);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

- [ ] **Step 2: Verify**

```bash
TOKEN="your_jwt_token"
curl -X POST https://1sol1dream-production.up.railway.app/api/dreams \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Build the world I dreamed of",
    "body": "This is my full story. I want to build something that matters.",
    "mood": "Serious",
    "images": ["https://example.com/img.jpg"],
    "links": [{"platform": "X", "url": "https://x.com/example"}]
  }'
# Expected: 201 { "dream": { "id": "...", "body": "...", "images": [...], "links": [...], "commentCount": 0 } }
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: update POST /api/dreams schema — body, images, links, 12-word title"
```

---

## Task 4: Update `PUT /api/dreams/:id` schema

**Files:**
- Modify: `server.js` — the `app.put("/api/dreams/:id"` handler (lines ~331–357)

- [ ] **Step 1: Replace the PUT handler body**

Replace the entire `app.put("/api/dreams/:id", auth, async (req, res) => { ... });` with:

```js
app.put("/api/dreams/:id", auth, async (req, res) => {
  try {
    const snap = await db.collection("dreams").doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: "Dream not found" });
    const dream = snap.data();
    if (dream.userId !== req.user.userId) return res.status(403).json({ error: "Not your dream" });
    if (dream.isDeleted) return res.status(400).json({ error: "Dream is deleted" });

    const { title, body, mood, images, links } = req.body;
    const updates = { updatedAt: Timestamp.now() };

    if (title !== undefined) {
      const locked = dream.titleLockedAt?.toMillis?.() || 0;
      if (Date.now() > locked) return res.status(400).json({ error: "Title is locked after 30 minutes" });
      const words = title.trim().split(/\s+/).filter(Boolean).length;
      if (words > 12) return res.status(400).json({ error: "Max 12 words" });
      updates.title = title.trim();
    }
    if (body !== undefined) updates.body = body.trim();
    if (mood !== undefined) updates.mood = mood;
    if (images !== undefined) {
      updates.images = Array.isArray(images)
        ? images.filter(u => typeof u === "string" && u.trim()).slice(0, 3).map(u => u.trim())
        : [];
    }
    if (links !== undefined) {
      updates.links = Array.isArray(links)
        ? links.filter(l => l?.platform && l?.url).slice(0, 3)
            .map(l => ({ platform: String(l.platform).trim(), url: String(l.url).trim() }))
        : [];
    }

    await snap.ref.update(updates);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

- [ ] **Step 2: Commit**

```bash
git add server.js
git commit -m "feat: update PUT /api/dreams/:id — accept body, images, links; drop proofImageUrl/proofLink"
```

---

## Task 5: `notify()` helper + notification endpoints

**Files:**
- Modify: `server.js` — insert after the `holder` middleware function (after line ~125), and before `GET /health`

- [ ] **Step 1: Add `notify()` helper after the `holder` middleware**

In `server.js`, after the closing `}` of the `holder` function (line ~125), insert:

```js
async function notify(userId, type, data) {
  try {
    await db.collection("dream_notifications").doc().set({
      userId, type, read: false, createdAt: Timestamp.now(), ...data,
    });
  } catch (e) { log(`[notify] error: ${e.message}`); }
}
```

- [ ] **Step 2: Add GET /api/notifications before `GET /health`**

In `server.js`, immediately before `app.get("/health"`, insert:

```js
app.get("/api/notifications", auth, async (req, res) => {
  try {
    const snap = await db.collection("dream_notifications")
      .where("userId", "==", req.user.userId)
      .orderBy("createdAt", "desc").limit(30).get();
    res.json({ notifications: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/notifications/read", auth, async (req, res) => {
  try {
    const snap = await db.collection("dream_notifications")
      .where("userId", "==", req.user.userId)
      .where("read", "==", false).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

- [ ] **Step 3: Verify**

```bash
TOKEN="your_jwt_token"

curl https://1sol1dream-production.up.railway.app/api/notifications \
  -H "Authorization: Bearer $TOKEN"
# Expected: { "notifications": [] }  (empty until hooks are wired in Task 7)

curl -X PUT https://1sol1dream-production.up.railway.app/api/notifications/read \
  -H "Authorization: Bearer $TOKEN"
# Expected: { "success": true }
```

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add notify() helper and GET/PUT /api/notifications"
```

---

## Task 6: `dream_comments` endpoints

**Files:**
- Modify: `server.js` — insert after `app.delete("/api/dreams/:id"` (around line 393)

- [ ] **Step 1: Add both comment endpoints after `DELETE /api/dreams/:id`**

In `server.js`, after the closing `});` of `app.delete("/api/dreams/:id"` (around line 393), insert:

```js
app.get("/api/dreams/:id/comments", async (req, res) => {
  try {
    const snap = await db.collection("dream_comments")
      .where("dreamId", "==", req.params.id)
      .orderBy("createdAt", "asc").limit(100).get();
    res.json({ comments: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/dreams/:id/comments", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "text required" });
    if (text.length > 500) return res.status(400).json({ error: "Comment must be 500 characters or fewer" });

    const dreamSnap = await db.collection("dreams").doc(req.params.id).get();
    if (!dreamSnap.exists) return res.status(404).json({ error: "Dream not found" });
    const dream = dreamSnap.data();

    const userSnap = await db.collection("dream_users").doc(req.user.userId).get();
    const user = userSnap.data();

    const commentRef = db.collection("dream_comments").doc();
    const comment = {
      dreamId: req.params.id,
      userId:  req.user.userId,
      username: user.username,
      profilePicUrl: user.profilePicUrl || "",
      text: text.trim(),
      createdAt: Timestamp.now(),
    };

    const batch = db.batch();
    batch.set(commentRef, comment);
    batch.update(dreamSnap.ref, { commentCount: FieldValue.increment(1) });
    await batch.commit();

    if (dream.userId !== req.user.userId) {
      notify(dream.userId, "comment_received", {
        fromUsername: user.username,
        dreamId: req.params.id,
        dreamTitle: dream.title,
      });
    }

    res.status(201).json({ comment: { id: commentRef.id, ...comment } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

- [ ] **Step 2: Verify**

```bash
# First get a real dream ID from Firestore
DREAM_ID="your_dream_id"
TOKEN="your_jwt_token"

curl https://1sol1dream-production.up.railway.app/api/dreams/$DREAM_ID/comments
# Expected: { "comments": [] }

curl -X POST https://1sol1dream-production.up.railway.app/api/dreams/$DREAM_ID/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"text": "This dream is incredible, I believe in you!"}'
# Expected: 201 { "comment": { "id": "...", "text": "...", "username": "..." } }

curl https://1sol1dream-production.up.railway.app/api/dreams/$DREAM_ID/comments
# Expected: { "comments": [{ "id": "...", "text": "This dream is incredible..." }] }
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add dream_comments GET/POST endpoints with commentCount increment and notify hook"
```

---

## Task 7: Hook `notify` into beliefs + `closeRound`

**Files:**
- Modify: `server.js` — `app.post("/api/beliefs/:dreamId"` (around line 415) and `closeRound` function (around line 548)

- [ ] **Step 1: Add notify hooks in `POST /api/beliefs/:dreamId`**

In `server.js`, find the belief handler. After `await batch.commit();` (the batch commit inside the beliefs handler, around line 465), and before the existing `await db.collection("dream_users")...` line, insert:

```js
    // ── Notify dream owner ────────────────────────────────────
    if (dream.userId !== userId) {
      notify(dream.userId, "belief_received", {
        fromUsername: req.user.username,
        dreamTitle:   dream.title,
        dreamId,
      });

      // Rank-change: notify once if this dream just became #1
      const topSnap = await db.collection("dreams")
        .where("isDeleted",  "==", false)
        .where("isRetired",  "==", false)
        .orderBy("beliefCount", "desc").limit(1).get();

      if (!topSnap.empty && topSnap.docs[0].id === dreamId) {
        const existingRankSnap = await db.collection("dream_notifications")
          .where("type",    "==", "rank_change")
          .where("dreamId", "==", dreamId)
          .limit(1).get();
        if (existingRankSnap.empty) {
          notify(dream.userId, "rank_change", { dreamId, dreamTitle: dream.title });
        }
      }
    }
```

- [ ] **Step 2: Add notify hooks in `closeRound`**

In `server.js`, in the `closeRound` function, find the line `await batch.commit();` followed by the `log(...)` call (around line 678). After that `log(...)` line, insert:

```js
    // ── Notifications ─────────────────────────────────────────
    notify(first.userId, "round_won", {
      dreamId:    first.id,
      dreamTitle: first.title,
      solAmount:  payouts[first.walletAddress] || 0,
    });

    const share = believers.length > 0 ? (prizePool * 0.3) / believers.length : 0;
    const uniqueBelieverUserIds = [...new Set(believerSnap.docs.map(d => d.data().userId))].filter(Boolean);
    for (const bUserId of uniqueBelieverUserIds) {
      if (bUserId !== first.userId) {
        notify(bUserId, "believer_won", {
          dreamId:    first.id,
          dreamTitle: first.title,
          solAmount:  share,
        });
      }
    }
```

Note: `believerSnap` and `believers` are already defined earlier in `closeRound`.

- [ ] **Step 3: Verify belief notification**

Place a belief on a dream you don't own (you'll need two accounts). Then:

```bash
TOKEN="owner_jwt_token"
curl https://1sol1dream-production.up.railway.app/api/notifications \
  -H "Authorization: Bearer $TOKEN"
# Expected: notifications array contains a "belief_received" entry
```

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: hook notify() into beliefs (belief_received, rank_change) and closeRound (round_won, believer_won)"
```

---

## Task 8: Frontend — `api.js` + `firebase.js`

**Files:**
- Modify: `src/services/api.js`
- Modify: `src/services/firebase.js`

- [ ] **Step 1: Update `src/services/api.js`**

Replace the `export const dreams = { ... };` block with:

```js
export const dreams = {
  list:          (params)         => api.get('/api/dreams', { params }).then(r => r.data),
  top:           ()               => api.get('/api/dreams/top').then(r => r.data),
  hall:          ()               => api.get('/api/dreams/hall').then(r => r.data),
  graveyard:     ()               => api.get('/api/dreams/graveyard').then(r => r.data),
  get:           (id)             => api.get(`/api/dreams/${id}`).then(r => r.data),
  post:          (data)           => api.post('/api/dreams', data).then(r => r.data),
  edit:          (id, data)       => api.put(`/api/dreams/${id}`, data).then(r => r.data),
  delete:        (id)             => api.delete(`/api/dreams/${id}`).then(r => r.data),
  generateTitle: (dreamText)      => api.post('/api/dreams/generate-title', { dreamText }).then(r => r.data),
  getComments:   (dreamId)        => api.get(`/api/dreams/${dreamId}/comments`).then(r => r.data),
  postComment:   (dreamId, text)  => api.post(`/api/dreams/${dreamId}/comments`, { text }).then(r => r.data),
};
```

After the `export const config = { ... };` block, add:

```js
export const notifications = {
  get:      () => api.get('/api/notifications').then(r => r.data),
  markRead: () => api.put('/api/notifications/read').then(r => r.data),
};
```

- [ ] **Step 2: Update `src/services/firebase.js`**

The file currently imports: `collection, doc, onSnapshot, query, where, orderBy, limit` from `'firebase/firestore'`. These are already imported. Add `listenComments` after `listenDream`:

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

- [ ] **Step 3: Commit**

```bash
git add src/services/api.js src/services/firebase.js
git commit -m "feat: add generateTitle, comments, notifications to api.js; add listenComments to firebase.js"
```

---

## Task 9: Rewrite `PostDreamModal.jsx`

**Files:**
- Modify: `src/components/dreams/PostDreamModal.jsx` (full rewrite)

- [ ] **Step 1: Replace the entire file**

```jsx
import { useState } from 'react';
import Modal from '../ui/Modal';
import { dreams as dreamsApi } from '../../services/api';

const MOODS = ['Serious', 'Funny', 'Delusional', 'Beautiful', 'Degenerate', 'Impossible', 'Unfinished'];
const MOOD_EMOJI = { Serious:'🎯', Funny:'😂', Delusional:'🌀', Beautiful:'✨', Degenerate:'🔥', Impossible:'🚀', Unfinished:'⏳' };
const MOOD_ACCENT  = { Serious:'rgba(0,255,209,0.15)', Funny:'rgba(255,215,0,0.15)', Delusional:'rgba(191,95,255,0.15)', Beautiful:'rgba(0,240,255,0.15)', Degenerate:'rgba(255,31,90,0.15)', Impossible:'rgba(255,110,0,0.15)', Unfinished:'rgba(120,120,160,0.15)' };
const MOOD_BORDER  = { Serious:'rgba(0,255,209,0.35)', Funny:'rgba(255,215,0,0.35)', Delusional:'rgba(191,95,255,0.35)', Beautiful:'rgba(0,240,255,0.35)', Degenerate:'rgba(255,31,90,0.35)', Impossible:'rgba(255,110,0,0.35)', Unfinished:'rgba(120,120,160,0.35)' };
const QUICK_PLATFORMS = ['X', 'Website', 'Instagram', 'TikTok', 'YouTube'];

const EMPTY_LINKS = [{ platform: '', url: '' }, { platform: '', url: '' }, { platform: '', url: '' }];

export default function PostDreamModal({ open, onClose, onPosted }) {
  const [form, setForm] = useState({
    body: '', title: '',
    images: ['', '', ''],
    links: EMPTY_LINKS.map(l => ({ ...l })),
    mood: '',
  });
  const [titleLoading,   setTitleLoading]   = useState(false);
  const [titleGenerated, setTitleGenerated] = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const wordCount = form.title.trim() ? form.title.trim().split(/\s+/).filter(Boolean).length : 0;

  const generateTitle = async () => {
    if (!form.body.trim()) { setError('Write your dream first'); return; }
    setTitleLoading(true); setError('');
    try {
      const { title } = await dreamsApi.generateTitle(form.body);
      setForm(f => ({ ...f, title }));
      setTitleGenerated(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to generate title');
    } finally { setTitleLoading(false); }
  };

  const setLink = (i, field, value) => {
    setForm(f => {
      const links = f.links.map((l, idx) => idx === i ? { ...l, [field]: value } : l);
      return { ...f, links };
    });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.mood) { setError('Pick a mood for your dream'); return; }
    if (wordCount > 12) { setError('Title must be 12 words or fewer'); return; }
    setLoading(true); setError('');
    try {
      const payload = {
        title:  form.title.trim(),
        body:   form.body.trim(),
        mood:   form.mood,
        images: form.images.filter(u => u.trim()),
        links:  form.links.filter(l => l.platform.trim() && l.url.trim()),
      };
      const result = await dreamsApi.post(payload);
      onPosted?.(result.dream);
      onClose();
      setForm({ body: '', title: '', images: ['', '', ''], links: EMPTY_LINKS.map(l => ({ ...l })), mood: '' });
      setTitleGenerated(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post dream');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Post Your Dream" maxWidth={600}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* ── Body ── */}
        <div>
          <label className="input-label">Your Dream</label>
          <textarea
            className="input" required
            style={{ resize: 'none', minHeight: 140, overflow: 'hidden' }}
            placeholder="Write your dream. Tell the story. Why this dream, why you, why now. Take as much space as you need."
            value={form.body}
            onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
          />
        </div>

        {/* ── Title ── */}
        <div>
          <label className="input-label">
            Title
            <span style={{
              marginLeft: 8, fontFamily: 'var(--font-mono)',
              color: wordCount > 12 ? 'var(--fading)' : wordCount > 10 ? 'rgba(255,180,0,0.8)' : 'var(--text-3)',
              fontSize: '0.75rem',
            }}>{wordCount}/12 words</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input" required style={{ flex: 1 }}
              placeholder="A title for your dream"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={generateTitle}
              disabled={titleLoading || !form.body.trim()}
              style={{ flexShrink: 0, minWidth: 100 }}>
              {titleLoading ? '···' : titleGenerated ? 'Regenerate ↺' : 'Generate ✦'}
            </button>
          </div>
        </div>

        {/* ── Images ── */}
        <div>
          <label className="input-label">Images <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.images.map((url, i) => (
              <input key={i} className="input" placeholder="Image URL"
                value={url}
                onChange={e => setForm(f => {
                  const images = [...f.images];
                  images[i] = e.target.value;
                  return { ...f, images };
                })}
              />
            ))}
          </div>
        </div>

        {/* ── Links ── */}
        <div>
          <label className="input-label">Links <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {form.links.map((link, i) => (
              <div key={i}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {QUICK_PLATFORMS.map(p => (
                    <button key={p} type="button"
                      onClick={() => setLink(i, 'platform', p)}
                      style={{
                        padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', cursor: 'pointer',
                        background: link.platform === p ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${link.platform === p ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        color: link.platform === p ? 'var(--gold)' : 'var(--text-2)',
                      }}>{p}</button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                  <input className="input" placeholder="Platform"
                    value={link.platform}
                    onChange={e => setLink(i, 'platform', e.target.value)}
                  />
                  <input className="input" placeholder="URL"
                    value={link.url}
                    onChange={e => setLink(i, 'url', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Mood ── */}
        <div>
          <label className="input-label">Mood</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MOODS.map(m => (
              <button key={m} type="button" onClick={() => setForm(f => ({ ...f, mood: m }))} style={{
                padding: '7px 14px', borderRadius: 'var(--r-full)', cursor: 'pointer',
                background: form.mood === m ? MOOD_ACCENT[m] : 'rgba(255,255,255,0.03)',
                border: `1px solid ${form.mood === m ? MOOD_BORDER[m] : 'rgba(255,255,255,0.08)'}`,
                color: form.mood === m ? 'var(--text)' : 'var(--text-2)',
                fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.15s',
                transform: form.mood === m ? 'scale(1.06)' : 'scale(1)',
              }}>{MOOD_EMOJI[m]} {m}</button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(255,31,90,0.08)', border: '1px solid rgba(255,31,90,0.25)',
            borderRadius: 'var(--r-md)', padding: '10px 14px',
            fontSize: '0.82rem', color: 'var(--fading)',
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading || !form.mood}>
            {loading ? 'Posting...' : 'Post My Dream'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Test in browser**

```
npm run dev
```

Open the Dreamboard, click "Post Dream". Verify:
- Body textarea autogrows as you type
- "Generate ✦" is disabled until body has text; clicking it calls the API and fills the title
- Button becomes "Regenerate ↺" after first generation
- Word count shows `X/12 words` and turns red at 13+
- Quick-pick platform buttons highlight on selection and fill the platform input
- Mood selector behaves identically to before
- Submitting a dream with all fields creates a dream with `body`, `images`, `links` in Firestore

- [ ] **Step 3: Commit**

```bash
git add src/components/dreams/PostDreamModal.jsx
git commit -m "feat: rewrite PostDreamModal — body, AI title generation, images, links"
```

---

## Task 10: Update `DreamCard.jsx`

**Files:**
- Modify: `src/components/dreams/DreamCard.jsx`

Changes are to the full (non-compact) card only. Four targeted edits.

- [ ] **Step 1: Add `useNavigate` import**

At the top of the file, the import is:
```js
import { Link } from 'react-router-dom';
```

Change to:
```js
import { Link, useNavigate } from 'react-router-dom';
```

- [ ] **Step 2: Add `navigate` inside the `DreamCard` function**

Inside `export default function DreamCard(...)`, after the existing `useState` declarations, add:

```js
  const navigate = useNavigate();
```

- [ ] **Step 3: Add image background to the art zone**

Find the art zone `<div>` (it starts around line 250 with `flex: 1, borderRadius: 11`). Inside that div, as the first child (before the mood icon div), add:

```jsx
            {/* Image background */}
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
```

Also ensure the existing content inside the art zone has `position: 'relative', zIndex: 1` or similar if needed — the art zone's own content `display: flex, flexDirection: column` won't stack over the absolute image unless the children have z-index. Add `style={{ position: 'relative', zIndex: 1 }}` to the mood icon div wrapper if needed. Actually, the art zone has `overflow: hidden` and the content is already naturally above an absolutely-positioned child. The absolute img has `zIndex: 0` so it will sit behind.

- [ ] **Step 4: Add body preview below the title in the art zone**

Find the dream title `<h3>` inside the art zone (around line 268). After the closing `</h3>`, add:

```jsx
            {/* Body preview */}
            {(dream.body || '').length > 0 && (
              <p style={{
                fontSize: '0.75rem', color: 'var(--text-3)', lineHeight: 1.4,
                marginBottom: 6, marginTop: -4,
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {(dream.body || '').slice(0, 80)}{(dream.body || '').length > 80 ? '…' : ''}
              </p>
            )}
```

- [ ] **Step 5: Update the stats grid to show commentCount**

Find the stats grid. It currently has three cells: Beliefs, Status, Rank. Replace the "Rank" cell (the third `<div style={{ padding: '7px 4px'...`)  with:

```jsx
            {/* Rank / Comments */}
            <div style={{ padding: '7px 4px', textAlign: 'center' }}>
              {rankLabel ? (
                <>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 900,
                    fontSize: '0.82rem', lineHeight: 1,
                    color: rankLabel ? rankColor : 'var(--text-3)',
                  }}>{rankLabel}</div>
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
```

- [ ] **Step 6: Make card clickable + add `stopPropagation` to Believe button**

Find the outer `<div onMouseEnter... onMouseLeave...>` (the root `return (` element). Add an `onClick` prop:

```jsx
      onClick={() => navigate(`/dreams/${dream.id}`)}
```

The cursor is already `'pointer'`.

Find the **Believe button** (the `<button onClick={handleBelieve}` in the footer). Change its `onClick` from:

```jsx
onClick={handleBelieve}
```

to:

```jsx
onClick={e => { e.stopPropagation(); handleBelieve(e); }}
```

(The boost button already has `e.stopPropagation()`. The profile `<Link>` already uses `e.stopPropagation()` via the outer click propagation — but since `<Link>` renders an `<a>`, clicking it won't bubble to the outer div in most browsers. Confirm this still works after testing.)

- [ ] **Step 7: Test in browser**

```
npm run dev
```

Open Dreamboard. Verify:
- Clicking anywhere on a card navigates to `/dreams/{id}` (which will 404 until Task 11 — that's fine)
- Clicking "Believe" does NOT navigate — it places the belief
- Clicking the profile link navigates to profile
- Cards with `images[0]` show a faint blurred background in the art zone
- Cards with `body` show a 2-line preview under the title
- Cards without a rank show the comment count

- [ ] **Step 8: Commit**

```bash
git add src/components/dreams/DreamCard.jsx
git commit -m "feat: update DreamCard — navigate to detail, image bg, body preview, commentCount stat"
```

---

## Task 11: Create `DreamDetail.jsx` + update `App.jsx`

**Files:**
- Create: `src/pages/DreamDetail.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create `src/pages/DreamDetail.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  collection, doc, getDoc, getDocs, query, where
} from 'firebase/firestore';
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
```

- [ ] **Step 2: Add route in `src/App.jsx`**

Add the import at the top with the other page imports:
```js
import DreamDetail from './pages/DreamDetail';
```

Inside `<Route element={<Layout />}>`, add:
```jsx
<Route path="/dreams/:id" element={<DreamDetail />} />
```

- [ ] **Step 3: Test in browser**

```
npm run dev
```

- Click any DreamCard → should navigate to `/dreams/{id}`
- Full body renders with line breaks preserved
- If the dream has images, they scroll horizontally
- If the dream has links, they appear as pill badges that open in new tab
- Believers section shows usernames
- Comments appear in real-time (post one and watch it appear without refresh)
- Logged-out users see "Sign in to comment" instead of the input

- [ ] **Step 4: Commit**

```bash
git add src/pages/DreamDetail.jsx src/App.jsx
git commit -m "feat: add DreamDetail page at /dreams/:id with real-time comments, believers, image gallery"
```

---

## Task 12: Notification Bell in `Navbar.jsx`

**Files:**
- Modify: `src/components/layout/Navbar.jsx`

- [ ] **Step 1: Add imports**

In `src/components/layout/Navbar.jsx`, update the existing imports:

```js
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useRoundStore } from '../../store/roundStore';
import { useState, useEffect, useRef } from 'react';
import CountdownTimer from '../ui/CountdownTimer';
import { notifications as notificationsApi } from '../../services/api';
```

- [ ] **Step 2: Add helpers at module scope (above the component)**

After the `NAV_LINKS` constant, add:

```js
const NOTIF_ICONS = {
  belief_received: '🔥',
  rank_change:     '🏆',
  round_won:       '👑',
  believer_won:    '👑',
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
```

- [ ] **Step 3: Add state and effects inside `Navbar` component**

Inside `export default function Navbar()`, after the existing state declarations (`scrolled`), add:

```js
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
```

- [ ] **Step 4: Add bell icon JSX in the nav**

In the `return (...)` of `Navbar`, find the `{/* Round pill */}` comment. **Before** it (between the nav links div and the round pill), insert:

```jsx
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
```

- [ ] **Step 5: Test in browser**

```
npm run dev
```

Verify:
- Bell icon appears in navbar for logged-in users, invisible for logged-out
- After placing a belief on another user's dream (use two accounts), the owner's bell shows a red badge with count 1
- Clicking the bell opens the dropdown
- Notifications list shows type-appropriate icons and human-readable messages
- Time-ago updates correctly
- Clicking a notification navigates to the dream and marks all as read (badge disappears)
- Clicking outside the panel closes it

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Navbar.jsx
git commit -m "feat: add notification bell with unread badge and dropdown to Navbar"
```

---

## Task 13: Firestore Indexes (manual setup — tell the user)

**No code changes.** The following composite indexes must be created in Firebase Console before comments and notifications will work in production.

**Firebase Console → Firestore Database → Indexes → Composite → Add index:**

| Collection | Fields | Query scope |
|-----------|--------|-------------|
| `dream_comments` | `dreamId` ASC · `createdAt` ASC | Collection |
| `dream_notifications` | `userId` ASC · `createdAt` DESC | Collection |
| `dream_notifications` | `userId` ASC · `read` ASC | Collection |
| `dream_beliefs_log` | `dreamId` ASC · `roundId` ASC | Collection |
| `dream_notifications` | `type` ASC · `dreamId` ASC | Collection |

These can also be auto-created by running the queries in the Firebase emulator — the console will log a link to create the missing index when a query fails.

---

## Self-Review Checklist

- [x] `POST /api/dreams/generate-title` — Task 2 ✓
- [x] `POST /api/dreams` schema update (body, title 12w, images, links, commentCount) — Task 3 ✓
- [x] `PUT /api/dreams/:id` update — Task 4 ✓
- [x] `GET/POST /api/dreams/:id/comments` — Task 6 ✓
- [x] `notify()` helper — Task 5 ✓
- [x] Notify hooks: belief_received, rank_change — Task 7 ✓
- [x] Notify hooks: round_won, believer_won in closeRound — Task 7 ✓
- [x] Notify hook: comment_received — Task 6 ✓
- [x] `GET/PUT /api/notifications` — Task 5 ✓
- [x] `GET /api/dreams/:id` — Task 1 ✓
- [x] `dreams.generateTitle`, `dreams.get`, `dreams.getComments`, `dreams.postComment` in api.js — Task 8 ✓
- [x] `notifications.get`, `notifications.markRead` in api.js — Task 8 ✓
- [x] `listenComments` in firebase.js — Task 8 ✓
- [x] PostDreamModal rewrite — Task 9 ✓
- [x] DreamCard: image bg, body preview, commentCount, navigate, stopPropagation on Believe — Task 10 ✓
- [x] DreamDetail page: body pre-wrap, images, links, believers, real-time comments — Task 11 ✓
- [x] `/dreams/:id` route in App.jsx — Task 11 ✓
- [x] Notification bell in Navbar — Task 12 ✓
- [x] 5 Firestore indexes documented — Task 13 ✓
- [x] `ANTHROPIC_API` env var (not `ANTHROPIC_API_KEY`) — confirmed in Task 2 ✓
- [x] `stopPropagation` on Believe button — Task 10 Step 6 ✓
- [x] Body preview font `0.75rem` — Task 10 Step 4 ✓
- [x] `dream_beliefs_log` uses `userId` directly for believers — Task 11 ✓
