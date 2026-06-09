/**
 * 1 SOL AND A DREAM — Server + Engine
 * Everything in one file. One Railway service.
 */
require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { initializeApp, cert }    = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getStorage }             = require("firebase-admin/storage");
const { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const bs58  = require("bs58");
const https = require("https");
const { startAutoClaimFees } = require("./claimFees");

// ── CONFIG ───────────────────────────────────────────────────
const PORT           = process.env.PORT || 4000;
const JWT_SECRET     = process.env.JWT_SECRET;
const SOLANA_RPC     = process.env.SOLANA_RPC;
const TOKEN_CA       = process.env.TOKEN_CA;
const CREATOR_WALLET = process.env.CREATOR_WALLET;
const ST_KEY         = process.env.SOLANATRACKER_API_KEY || "";
const ROUND_MS       = parseInt(process.env.ROUND_DURATION_MS || "3600000");
const GAS_RESERVE    = parseFloat(process.env.GAS_RESERVE_SOL || "0.1");
const FREE_BELIEFS   = 3;
const MAX_BELIEFS    = 6;
const LOCK_MS        = 15 * 60 * 1000; // 15 minute belief lock

["JWT_SECRET","SOLANA_RPC","TOKEN_CA","CREATOR_WALLET","CREATOR_PRIVATE_KEY","FIREBASE_SERVICE_ACCOUNT_JSON","GEMINI_API"].forEach(k => {
  if (!process.env[k]) { console.error(`Missing env: ${k}`); process.exit(1); }
});

// ── INIT ─────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({
  credential:    cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
});
const db         = getFirestore();
const connection = new Connection(SOLANA_RPC, { commitment: "confirmed" });
const creatorKP  = Keypair.fromSecretKey(bs58.decode(process.env.CREATOR_PRIVATE_KEY));
const app        = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const log   = m => console.log(`[${new Date().toISOString()}] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function apiError(res, label, e, fallback = "Internal server error") {
  const message = e?.message || fallback;
  const code    = e?.code || e?.status || null;

  log(`[${label}] ERROR: ${message}`);

  // Keep this. Firestore missing-index errors often include the exact
  // Firebase Console link inside the full error object / stack. Railway
  // will show it in Deploy Logs so you can click or copy it.
  console.error(e);

  return res.status(500).json({
    error: message,
    code,
    details: e?.details || null,
  });
}

// ── SOLANA ───────────────────────────────────────────────────
function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(new Error("parse")); } });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

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

async function getTokenPriceUSD() {
  try {
    const d = await fetchJSON(`https://data.solanatracker.io/price?token=${TOKEN_CA}`, { "x-api-key": ST_KEY });
    return parseFloat(d?.price || 0);
  } catch { return 0; }
}

async function getSOLPriceUSD() {
  try {
    const d = await fetchJSON("https://data.solanatracker.io/price?token=So11111111111111111111111111111111111111112", { "x-api-key": ST_KEY });
    return parseFloat(d?.price || 150);
  } catch { return 150; }
}

async function getTokenBalance(walletAddress) {
  try {
    const accts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { mint: new PublicKey(TOKEN_CA) }
    );
    if (!accts.value.length) return 0;
    return accts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
  } catch { return 0; }
}

async function checkHolding(walletAddress) {
  const [bal, tokenPrice, solPrice] = await Promise.all([
    getTokenBalance(walletAddress),
    getTokenPriceUSD(),
    getSOLPriceUSD(),
  ]);
  const solValue = solPrice > 0 ? (bal * tokenPrice) / solPrice : 0;
  return { qualified: solValue >= 0.05, solValue, tokenBalance: bal };
}

async function getCreatorSOLBalance() {
  try {
    const bal = await connection.getBalance(new PublicKey(CREATOR_WALLET));
    return bal / LAMPORTS_PER_SOL;
  } catch { return 0; }
}

async function sendSOL(toAddress, amountSOL) {
  const lamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);
  if (lamports < 1000) return null;
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: creatorKP.publicKey, toPubkey: new PublicKey(toAddress), lamports })
  );
  const sig = await connection.sendTransaction(tx, [creatorKP]);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid or expired token" }); }
}

async function holder(req, res, next) {
  const { qualified } = await checkHolding(req.user.walletAddress);
  if (!qualified) return res.status(403).json({ error: "You need to hold 1 SOL worth of the token to do that." });
  next();
}

async function notify(userId, type, data) {
  try {
    await db.collection("dream_notifications").doc().set({
      userId, type, read: false, createdAt: Timestamp.now(), ...data,
    });
  } catch (e) { log(`[notify] error: ${e.message}`); }
}

// ══════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════

// ── Wallet verify ────────────────────────────────────────────
app.get("/api/verify-wallet", async (req, res) => {
  try {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    const result = await checkHolding(wallet);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Signup ───────────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, password, walletAddress } = req.body;
    if (!username || !password || !walletAddress)
      return res.status(400).json({ error: "Username, password, and wallet address are required" });
    if (!/^[a-z0-9_]{2,24}$/.test(username))
      return res.status(400).json({ error: "Username: 2–24 chars, lowercase letters/numbers/underscores only" });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });

    try { new PublicKey(walletAddress); } catch { return res.status(400).json({ error: "Invalid Solana wallet address" }); }

    const [uSnap, wSnap] = await Promise.all([
      db.collection("dream_users").where("username", "==", username).limit(1).get(),
      db.collection("dream_users").where("walletAddress", "==", walletAddress).limit(1).get(),
    ]);
    if (!uSnap.empty) return res.status(409).json({ error: "Username already taken" });
    if (!wSnap.empty) return res.status(409).json({ error: "Wallet already registered" });

    const { qualified, solValue, tokenBalance } = await checkHolding(walletAddress);
    if (!qualified) return res.status(403).json({ error: `Need ≥ 1 SOL worth of tokens. Current: ◎${solValue.toFixed(4)}`, solValue, qualified: false });

    const passwordHash = await bcrypt.hash(password, 10);
    const now = Timestamp.now();
    const ref = db.collection("dream_users").doc();
    const user = {
      userId: ref.id, username, walletAddress, passwordHash,
      profilePicUrl: "", badges: [], holderStatus: "active",
      neverSoldStreak: 0, roundsParticipated: 0, roundsWon: 0,
      totalBeliefsGiven: 0, tokenBalance, solValue,
      createdAt: now, updatedAt: now,
    };
    await ref.set(user);
    await db.doc("dream_stats/global").set({ totalUsers: FieldValue.increment(1) }, { merge: true });

    const token = jwt.sign({ userId: ref.id, username, walletAddress }, JWT_SECRET, { expiresIn: "30d" });
    const { passwordHash: _, ...safe } = user;
    res.status(201).json({ token, user: safe });
    log(`[signup] ${username}`);
  } catch (e) { log(`[signup] error: ${e.message}`); res.status(500).json({ error: "Signup failed" }); }
});

// ── Login ────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });
    const snap = await db.collection("dream_users").where("username", "==", username.toLowerCase()).limit(1).get();
    if (snap.empty) return res.status(401).json({ error: "Invalid username or password" });
    const docRef = snap.docs[0];
    const user   = { id: docRef.id, ...docRef.data() };
    const ok     = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid username or password" });
    // Holdings check on login
    const { qualified, solValue, tokenBalance } = await checkHolding(user.walletAddress);
    const holderStatus = qualified ? "active" : "grey";
    await docRef.ref.update({ holderStatus, solValue, tokenBalance, updatedAt: Timestamp.now() });
    const token = jwt.sign({ userId: docRef.id, username: user.username, walletAddress: user.walletAddress }, JWT_SECRET, { expiresIn: "30d" });
    const { passwordHash: _, ...safe } = { ...user, holderStatus, solValue, tokenBalance };
    res.json({ token, user: safe });
  } catch (e) { res.status(500).json({ error: "Login failed" }); }
});

// ── Me ───────────────────────────────────────────────────────
app.get("/api/me", auth, async (req, res) => {
  try {
    const snap = await db.collection("dream_users").doc(req.user.userId).get();
    if (!snap.exists) return res.status(404).json({ error: "User not found" });
    const { passwordHash: _, ...u } = snap.data();
    res.json({ userId: snap.id, ...u });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// ── Profile ──────────────────────────────────────────────────
app.get("/api/profile/:wallet", async (req, res) => {
  try {
    const snap = await db.collection("dream_users").where("walletAddress", "==", req.params.wallet).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: "Profile not found" });
    const { passwordHash: _, ...u } = snap.docs[0].data();
    const dreamsSnap = await db.collection("dreams")
      .where("walletAddress", "==", req.params.wallet)
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc").limit(20).get();
    const wa = req.params.wallet;
    res.json({
      ...u, userId: snap.docs[0].id,
      walletShort: `${wa.slice(0, 4)}...${wa.slice(-4)}`,
      dreams: dreamsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/profile", auth, async (req, res) => {
  try {
    const { displayName, profilePicUrl } = req.body;
    const updates = { updatedAt: Timestamp.now() };
    if (displayName !== undefined) updates.displayName = displayName.trim().slice(0, 50);
    if (profilePicUrl !== undefined) updates.profilePicUrl = profilePicUrl;
    await db.collection("dream_users").doc(req.user.userId).update(updates);
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Failed" }); }
});

// ── Dreams ───────────────────────────────────────────────────
app.get("/api/dreams", async (req, res) => {
  try {
    const { filter = "top", limit: lim = 50 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(lim, 10) || 50, 1), 100);

    let q = db.collection("dreams")
      .where("isDeleted", "==", false)
      .where("isRetired", "==", false);

    if (filter === "faded") {
      q = q.where("state", "in", ["grey", "resurrected"]).orderBy("beliefCount", "desc");
    } else if (filter === "new") {
      q = q.orderBy("createdAt", "desc");
    } else if (filter === "rising") {
      q = q.orderBy("recentBeliefs", "desc");
    } else if (filter === "top") {
      q = q.orderBy("beliefCount", "desc");
    } else {
      q = q.orderBy("beliefCount", "desc");
    }

    log(`[GET /api/dreams] filter=${filter}, limit=${safeLimit}`);

    const snap = await q.limit(safeLimit).get();
    res.json({ dreams: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    return apiError(res, "GET /api/dreams", e, "Failed to load dreams");
  }
});

app.get("/api/dreams/top", async (req, res) => {
  try {
    log("[GET /api/dreams/top]");

    const snap = await db.collection("dreams")
      .where("isDeleted", "==", false).where("isRetired", "==", false)
      .where("state", "in", ["alive", "fading", "resurrected"])
      .orderBy("beliefCount", "desc").limit(10).get();
    res.json({ dreams: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    return apiError(res, "GET /api/dreams/top", e, "Failed to load top dreams");
  }
});

app.get("/api/dreams/hall", async (req, res) => {
  try {
    const snap = await db.collection("dream_winners").orderBy("wonAt", "desc").limit(50).get();
    res.json({ winners: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/dreams/graveyard", async (req, res) => {
  try {
    log("[GET /api/dreams/graveyard]");

    const snap = await db.collection("dreams")
      .where("isDeleted", "==", false)
      .where("state", "in", ["grey", "resurrected"])
      .orderBy("updatedAt", "desc").limit(50).get();
    res.json({ dreams: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    return apiError(res, "GET /api/dreams/graveyard", e, "Failed to load graveyard");
  }
});

app.get("/api/dreams/:id", async (req, res) => {
  try {
    const snap = await db.collection("dreams").doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: "Dream not found" });
    res.json({ dream: { id: snap.id, ...snap.data() } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/dreams/generate-title", auth, async (req, res) => {
  try {
    const { dreamText } = req.body;
    if (!dreamText?.trim()) return res.status(400).json({ error: "dreamText required" });

    const result = await postJSON(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API}`,
      {},
      {
        contents: [{
          parts: [{
            text: `Generate a short poetic title (maximum 8 words, no quotes, no punctuation at the end) that captures the soul of this dream:\n\n${dreamText.slice(0, 2000)}`,
          }],
        }],
        generationConfig: { maxOutputTokens: 50, temperature: 0.9 },
      }
    );

    if (result?.error) {
      log(`[generate-title] Gemini error: ${JSON.stringify(result.error)}`);
      return res.status(500).json({ error: result.error.message || "Gemini API error" });
    }
    const title = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!title) {
      log(`[generate-title] unexpected response: ${JSON.stringify(result)}`);
      return res.status(500).json({ error: "Failed to generate title" });
    }
    res.json({ title });
  } catch (e) {
    log(`[generate-title] error: ${e.message}`);
    res.status(500).json({ error: "Failed to generate title" });
  }
});

app.post("/api/dreams/upload-image", auth, async (req, res) => {
  try {
    const { data, contentType, filename } = req.body;
    if (!data || !contentType) return res.status(400).json({ error: "data and contentType required" });

    const buffer = Buffer.from(data, "base64");
    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: "Image too large (max 5MB)" });

    const safeName = (filename || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `dream-images/${Date.now()}-${safeName}`;
    const file = getStorage().bucket().file(filePath);

    await file.save(buffer, { metadata: { contentType }, resumable: false });
    await file.makePublic();

    const url = `https://storage.googleapis.com/${getStorage().bucket().name}/${filePath}`;
    log(`[upload-image] ${filePath}`);
    res.json({ url });
  } catch (e) {
    log(`[upload-image] error: ${e.message}`);
    res.status(500).json({ error: "Failed to upload image: " + e.message });
  }
});

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
      mood: mood || null,
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

app.delete("/api/dreams/:id", auth, async (req, res) => {
  try {
    const snap = await db.collection("dreams").doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: "Dream not found" });
    const dream = snap.data();
    if (dream.userId !== req.user.userId) return res.status(403).json({ error: "Not your dream" });
    if (dream.isDeleted)  return res.status(400).json({ error: "Already deleted" });
    if (dream.isRetired)  return res.status(400).json({ error: "Cannot delete a retired dream" });
    if ((dream.deleteCount || 0) >= 1) return res.status(400).json({ error: "You can only delete and repost once per round" });

    // Return free beliefs to believers
    const logSnap = await db.collection("dream_beliefs_log")
      .where("dreamId", "==", req.params.id)
      .where("roundId", "==", dream.roundId)
      .where("isFree", "==", true).get();

    const returnMap = {};
    for (const doc of logSnap.docs) {
      const { userId, roundId } = doc.data();
      const key = `${roundId}_${userId}`;
      returnMap[key] = (returnMap[key] || 0) + 1;
    }

    const batch = db.batch();
    for (const [key, count] of Object.entries(returnMap)) {
      batch.update(db.collection("dream_beliefs").doc(key), {
        totalBeliefs: FieldValue.increment(-count),
        dreamIds: FieldValue.arrayRemove(req.params.id),
      });
    }
    batch.update(snap.ref, { isDeleted: true, deleteCount: FieldValue.increment(1), updatedAt: Timestamp.now() });
    await batch.commit();
    res.json({ success: true, message: "Dream deleted. Free beliefs returned." });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
    if (!user) return res.status(404).json({ error: "User not found" });

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

// ── Beliefs ──────────────────────────────────────────────────
app.get("/api/beliefs/me", auth, async (req, res) => {
  try {
    const roundSnap = await db.doc("dream_stats/currentRound").get();
    if (!roundSnap.exists) return res.json({ beliefs: [], totalBeliefs: 0, remaining: FREE_BELIEFS, purchasedBeliefs: 0 });
    const { roundId } = roundSnap.data();
    const doc = await db.collection("dream_beliefs").doc(`${roundId}_${req.user.userId}`).get();
    if (!doc.exists) return res.json({ beliefs: [], totalBeliefs: 0, remaining: FREE_BELIEFS, purchasedBeliefs: 0 });
    const d = doc.data();
    const maxAvail = Math.min(MAX_BELIEFS, FREE_BELIEFS + (d.purchasedBeliefs || 0));
    res.json({
      beliefs: d.dreamIds || [],
      beliefTimestamps: d.beliefTimestamps || {},
      totalBeliefs: d.totalBeliefs || 0,
      purchasedBeliefs: d.purchasedBeliefs || 0,
      remaining: Math.max(0, maxAvail - (d.totalBeliefs || 0)),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/beliefs/:dreamId", auth, holder, async (req, res) => {
  try {
    const { dreamId } = req.params;
    const { userId, walletAddress } = req.user;

    const roundSnap = await db.doc("dream_stats/currentRound").get();
    if (!roundSnap.exists) return res.status(503).json({ error: "No active round" });
    const { roundId } = roundSnap.data();

    const dreamSnap = await db.collection("dreams").doc(dreamId).get();
    if (!dreamSnap.exists || dreamSnap.data().isDeleted) return res.status(404).json({ error: "Dream not found" });
    const dream = dreamSnap.data();
    if (dream.userId === userId)  return res.status(400).json({ error: "You cannot believe in your own dream" });
    if (dream.state === "grey")   return res.status(400).json({ error: "This dream is faded — it cannot receive beliefs" });
    if (dream.isRetired)          return res.status(400).json({ error: "This dream has already won" });

    const beliefRef  = db.collection("dream_beliefs").doc(`${roundId}_${userId}`);
    const beliefSnap = await beliefRef.get();
    const bs = beliefSnap.exists ? beliefSnap.data() : {
      roundId, userId, walletAddress, dreamIds: [],
      beliefTimestamps: {}, totalBeliefs: 0, purchasedBeliefs: 0,
    };

    if ((bs.dreamIds || []).includes(dreamId)) return res.status(400).json({ error: "Already believed in this dream" });
    const maxAvail = Math.min(MAX_BELIEFS, FREE_BELIEFS + (bs.purchasedBeliefs || 0));
    if ((bs.totalBeliefs || 0) >= maxAvail) {
      return res.status(400).json({ error: "No beliefs remaining.", canPurchase: (bs.totalBeliefs || 0) < MAX_BELIEFS });
    }

    const isFree = (bs.totalBeliefs || 0) < FREE_BELIEFS;
    const now    = Date.now();
    const batch  = db.batch();
    const update = {
      dreamIds: FieldValue.arrayUnion(dreamId),
      [`beliefTimestamps.${dreamId}`]: now,
      totalBeliefs: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    };
    beliefSnap.exists
      ? batch.update(beliefRef, update)
      : batch.set(beliefRef, { ...bs, ...update, createdAt: Timestamp.now() });

    batch.set(db.collection("dream_beliefs_log").doc(), {
      roundId, userId, walletAddress, dreamId, isFree, placedAt: Timestamp.now(),
    });
    batch.update(db.collection("dreams").doc(dreamId), {
      beliefCount: FieldValue.increment(1),
      recentBeliefs: FieldValue.increment(1),
    });
    batch.set(db.doc("dream_stats/global"), { totalBeliefsPlaced: FieldValue.increment(1) }, { merge: true });
    await batch.commit();

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

    await db.collection("dream_users").doc(userId).update({ totalBeliefsGiven: FieldValue.increment(1) });

    const newTotal = (bs.totalBeliefs || 0) + 1;
    res.json({ success: true, total: newTotal, remaining: Math.max(0, maxAvail - newTotal) });
    log(`[belief] ${walletAddress.slice(0, 8)}… → "${dream.title.slice(0, 30)}"`);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/beliefs/:dreamId", auth, async (req, res) => {
  try {
    const { dreamId } = req.params;
    const { userId } = req.user;

    const roundSnap = await db.doc("dream_stats/currentRound").get();
    if (!roundSnap.exists) return res.status(503).json({ error: "No active round" });
    const { roundId } = roundSnap.data();

    const beliefRef  = db.collection("dream_beliefs").doc(`${roundId}_${userId}`);
    const beliefSnap = await beliefRef.get();
    if (!beliefSnap.exists || !(beliefSnap.data().dreamIds || []).includes(dreamId))
      return res.status(404).json({ error: "Belief not found" });

    const placed = beliefSnap.data().beliefTimestamps?.[dreamId] || 0;
    if (Date.now() - placed > LOCK_MS)
      return res.status(400).json({ error: "This belief has locked — it has been more than 15 minutes since you placed it." });

    const batch = db.batch();
    batch.update(beliefRef, { dreamIds: FieldValue.arrayRemove(dreamId), totalBeliefs: FieldValue.increment(-1) });
    batch.update(db.collection("dreams").doc(dreamId), { beliefCount: FieldValue.increment(-1), recentBeliefs: FieldValue.increment(-1) });
    await batch.commit();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/config", async (req, res) => {
  try {
    const snap = await db.doc("config/platform").get();
    const costs = snap.exists ? (snap.data().beliefCosts || {}) : {};
    res.json({
      creatorWallet: CREATOR_WALLET,
      beliefCosts: {
        fourth: costs.fourth || 1000,
        fifth:  costs.fifth  || 2000,
        sixth:  costs.sixth  || 4000,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

app.get("/health", (req, res) => res.json({ ok: true }));

// ══════════════════════════════════════════════════════════════
// ENGINE — runs inside this same process
// ══════════════════════════════════════════════════════════════

async function startNewRound(prevNumber = 0) {
  const number  = prevNumber + 1;
  const endsAt  = Timestamp.fromMillis(Date.now() + ROUND_MS);
  const roundId = `round_${number}_${Date.now()}`;

  const batch = db.batch();
  batch.set(db.collection("dream_rounds").doc(roundId), {
    roundId, roundNumber: number,
    startedAt: Timestamp.now(), endsAt,
    status: "active", prizePoolSol: 0,
    winners: {}, payoutStatus: "pending",
  });
  batch.set(db.doc("dream_stats/currentRound"), {
    roundId, roundNumber: number,
    startedAt: Timestamp.now(), endsAt,
    status: "active", currentPotSOL: 0,
  });

  // Reset recentBeliefs on all active dreams
  const dreamsSnap = await db.collection("dreams")
    .where("isDeleted", "==", false).where("isRetired", "==", false).get();
  dreamsSnap.docs.forEach(d => batch.update(d.ref, { recentBeliefs: 0, roundId }));

  await batch.commit();
  log(`[engine] Round ${number} started — ends ${new Date(Date.now() + ROUND_MS).toISOString()}`);
}

async function closeRound(round) {
  log(`[engine] Closing round ${round.roundNumber}`);

  // Mark as distributing IMMEDIATELY so roundTick doesn't call this again
  // while payouts are in progress (payouts can take 30-60s with sleeps)
  await db.doc("dream_stats/currentRound").update({ status: "distributing" }).catch(() => {});

  try {
    // Get top active dreams by belief count, tie-break by createdAt
    const snap = await db.collection("dreams")
      .where("isDeleted", "==", false).where("isRetired", "==", false)
      .where("state", "in", ["alive", "fading", "resurrected"])
      .orderBy("beliefCount", "desc").limit(10).get();

    const dreams = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        if (b.beliefCount !== a.beliefCount) return b.beliefCount - a.beliefCount;
        return (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0);
      });

    if (!dreams.length) {
      log("[engine] No dreams this round — pool carries forward");
      await db.collection("dream_rounds").doc(round.roundId).update({ status: "complete", payoutStatus: "skipped" });
      return startNewRound(round.roundNumber);
    }

    const [first, second, third] = dreams;

    // Prize pool
    const totalSOL  = await getCreatorSOLBalance();
    const prizePool = Math.max(0, totalSOL - GAS_RESERVE);
    log(`[engine] Prize pool: ◎${prizePool.toFixed(4)}, top beliefCount: ${first.beliefCount}`);

    // Skip — nothing to award: pot is empty OR no one believed in anything
    if (prizePool <= 0.001 || first.beliefCount < 1) {
      log(`[engine] Round skipped — no SOL or no believers, pool carries to next round`);
      await db.collection("dream_rounds").doc(round.roundId)
        .update({ status: "complete", payoutStatus: "skipped_no_pot", closedAt: Timestamp.now() });
      return startNewRound(round.roundNumber);
    }

    // Build payout map
    const payouts = {};
    // Fetch believerSnap here so it's in scope for notifications below
    const believerSnap = await db.collection("dream_beliefs_log")
      .where("dreamId", "==", first.id).where("roundId", "==", round.roundId).get();
    const believers = [...new Set(believerSnap.docs.map(d => d.data().walletAddress))];
    if (prizePool > 0.001) {
      payouts[first.walletAddress] = (payouts[first.walletAddress] || 0) + prizePool * 0.5;
      if (second) payouts[second.walletAddress] = (payouts[second.walletAddress] || 0) + prizePool * 0.1;
      if (third)  payouts[third.walletAddress]  = (payouts[third.walletAddress]  || 0) + prizePool * 0.1;

      // 30% split among believers of 1st place
      if (believers.length) {
        const share = (prizePool * 0.3) / believers.length;
        believers.forEach(w => { payouts[w] = (payouts[w] || 0) + share; });
        log(`[engine] ${believers.length} believers get ◎${share.toFixed(4)} each`);
      }
    }

    // Send payouts
    const sigs = {};
    for (const [wallet, amount] of Object.entries(payouts)) {
      if (amount < 0.0001) continue;
      try {
        sigs[wallet] = await sendSOL(wallet, amount);
        log(`[engine] ◎${amount.toFixed(4)} → ${wallet.slice(0, 8)}…`);
      } catch (e) {
        log(`[engine] payout FAILED → ${wallet.slice(0, 8)}…: ${e.message}`);
      }
      await sleep(500);
    }

    // Update Firestore
    const batch = db.batch();

    // 1st place only — RETIRE to Hall of Dreams
    batch.update(db.collection("dreams").doc(first.id), {
      isRetired: true, state: "crowned",
      winningRound: round.roundId,
      prizeAmountSol: prizePool * 0.5,
      updatedAt: Timestamp.now(),
    });
    batch.set(db.collection("dream_winners").doc(`${round.roundId}_${first.id}`), {
      dreamId: first.id, userId: first.userId,
      walletAddress: first.walletAddress,
      username: first.username,
      title: first.title, story: first.story || "", mood: first.mood,
      beliefCount: first.beliefCount,
      roundId: round.roundId, roundNumber: round.roundNumber,
      solWon: payouts[first.walletAddress] || 0,
      place: 1, wonAt: Timestamp.now(), fulfillmentProof: "",
    });

    // 2nd and 3rd NOT retired — they carry to next round
    if (second) {
      batch.update(db.collection("dreams").doc(second.id), {
        prizeAmountSol: prizePool * 0.1, updatedAt: Timestamp.now(),
      });
    }
    if (third) {
      batch.update(db.collection("dreams").doc(third.id), {
        prizeAmountSol: prizePool * 0.1, updatedAt: Timestamp.now(),
      });
    }

    // Award badges
    const winnerUserSnap = await db.collection("dream_users")
      .where("walletAddress", "==", first.walletAddress).limit(1).get();
    if (!winnerUserSnap.empty) {
      batch.update(winnerUserSnap.docs[0].ref, {
        roundsWon: FieldValue.increment(1),
        badges: FieldValue.arrayUnion("funded"),
      });
    }

    // Close the round doc
    batch.update(db.collection("dream_rounds").doc(round.roundId), {
      status: "complete",
      prizePoolSol: prizePool,
      winners: {
        first:  { dreamId: first.id,  walletAddress: first.walletAddress,  beliefCount: first.beliefCount,  solWon: payouts[first.walletAddress]  || 0 },
        second: second ? { dreamId: second.id, walletAddress: second.walletAddress, beliefCount: second.beliefCount, solWon: payouts[second.walletAddress] || 0 } : null,
        third:  third  ? { dreamId: third.id,  walletAddress: third.walletAddress,  beliefCount: third.beliefCount,  solWon: payouts[third.walletAddress]  || 0 } : null,
      },
      payoutTxSignatures: sigs,
      payoutStatus: "complete",
      winnerTitle: first.title,
      winnerUsername: first.username,
      closedAt: Timestamp.now(),
    });

    batch.set(db.doc("dream_stats/global"), {
      totalSOLDistributed: FieldValue.increment(prizePool),
      totalDreamsFunded: FieldValue.increment(1),
      totalRoundsCompleted: FieldValue.increment(1),
    }, { merge: true });

    await batch.commit();
    log(`[engine] Round ${round.roundNumber} complete. Winner: "${first.title}"`);

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

  } catch (e) {
    log(`[engine] closeRound ERROR: ${e.message}`);
    await db.collection("dream_rounds").doc(round.roundId)
      .update({ payoutStatus: "partial_failure", payoutError: e.message }).catch(() => {});
  }

  return startNewRound(round.roundNumber);
}

// Round check — every 10 seconds
async function roundTick() {
  try {
    const snap = await db.doc("dream_stats/currentRound").get();
    if (!snap.exists || !snap.data()?.roundId) {
      log("[engine] No round found — starting round 1");
      await startNewRound(0);
      return;
    }
    const round  = snap.data();
    if (round.status !== "active") return;
    const endsAt = round.endsAt?.toMillis?.() || 0;
    if (Date.now() >= endsAt) await closeRound(round);
  } catch (e) { log(`[engine] roundTick error: ${e.message}`); }
}

// Balance update — every 15 seconds
async function balanceTick() {
  try {
    const bal = await getCreatorSOLBalance();
    const pot = Math.max(0, bal - GAS_RESERVE);
    await db.doc("dream_stats/currentRound").update({ currentPotSOL: pot }).catch(() => {});
    await db.doc("dream_stats/global").set({ currentPotSOL: pot }, { merge: true });
  } catch (e) { log(`[engine] balanceTick error: ${e.message}`); }
}

// Holder monitor — every 5 minutes
async function holderTick() {
  try {
    const [tokenPrice, solPrice] = await Promise.all([getTokenPriceUSD(), getSOLPriceUSD()]);
    if (!tokenPrice || !solPrice) return;

    const snap = await db.collection("dreams")
      .where("isDeleted", "==", false).where("isRetired", "==", false).get();

    for (const doc of snap.docs) {
      const dream = doc.data();
      try {
        const bal       = await getTokenBalance(dream.walletAddress);
        const solValue  = (bal * tokenPrice) / solPrice;
        const qualified = solValue >= 0.05;

        let newState = dream.state;
        if (!qualified && dream.state !== "grey") newState = "grey";
        else if (qualified && dream.state === "grey") newState = "resurrected";

        if (newState !== dream.state) {
          await doc.ref.update({ state: newState, updatedAt: Timestamp.now() });
          const uSnap = await db.collection("dream_users")
            .where("walletAddress", "==", dream.walletAddress).limit(1).get();
          if (!uSnap.empty) {
            const updates = { holderStatus: qualified ? "active" : "faded" };
            if (!qualified) updates.badges = FieldValue.arrayUnion("faded");
            if (newState === "resurrected") updates.badges = FieldValue.arrayUnion("resurrected");
            await uSnap.docs[0].ref.update(updates);
          }
          log(`[engine] ${dream.walletAddress.slice(0, 8)}…: ${dream.state} → ${newState}`);
        }
        await sleep(150);
      } catch (e) { log(`[engine] holder check error for ${dream.walletAddress.slice(0, 8)}…: ${e.message}`); }
    }
  } catch (e) { log(`[engine] holderTick error: ${e.message}`); }
}

// Token transfer monitor — every 30 seconds (for extra beliefs)
let lastTransferSig = null;

async function transferTick() {
  try {
    const opts = { limit: 20 };
    if (lastTransferSig) opts.until = lastTransferSig;
    const sigs = await connection.getSignaturesForAddress(new PublicKey(CREATOR_WALLET), opts);
    if (!sigs.length) return;
    lastTransferSig = sigs[0].signature;

    const configSnap = await db.doc("config/platform").get();
    const costs = configSnap.exists
      ? (configSnap.data().beliefCosts || { fourth: 1000, fifth: 2000, sixth: 4000 })
      : { fourth: 1000, fifth: 2000, sixth: 4000 };

    const roundSnap = await db.doc("dream_stats/currentRound").get();
    if (!roundSnap.exists) return;
    const { roundId } = roundSnap.data();

    for (const sig of sigs.reverse()) {
      const existing = await db.collection("tokenTransfers").doc(sig.signature).get();
      if (existing.exists) continue;
      try {
        const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
        if (!tx) continue;

        let fromWallet = null, tokenAmount = 0;
        for (const ix of tx.transaction.message.instructions) {
          if (ix.program === "spl-token" && (ix.parsed?.type === "transfer" || ix.parsed?.type === "transferChecked")) {
            const info = ix.parsed.info;
            fromWallet  = info.authority || info.multisigAuthority;
            tokenAmount = info.tokenAmount ? parseFloat(info.tokenAmount.uiAmount || 0) : (parseInt(info.amount || 0) / 1_000_000);
          }
        }
        if (!fromWallet || !tokenAmount) { await db.collection("tokenTransfers").doc(sig.signature).set({ sig: sig.signature, note: "no token transfer found", processedAt: Timestamp.now() }); continue; }

        const uSnap = await db.collection("dream_users").where("walletAddress", "==", fromWallet).limit(1).get();
        if (uSnap.empty) { await db.collection("tokenTransfers").doc(sig.signature).set({ fromWallet, tokenAmount, note: "wallet not registered", processedAt: Timestamp.now() }); continue; }
        const user = { id: uSnap.docs[0].id, ...uSnap.docs[0].data() };

        const tol = 0.02;
        let creditedAs = null;
        if (Math.abs(tokenAmount - costs.fourth) <= costs.fourth * tol) creditedAs = "belief4";
        else if (Math.abs(tokenAmount - costs.fifth) <= costs.fifth * tol) creditedAs = "belief5";
        else if (Math.abs(tokenAmount - costs.sixth) <= costs.sixth * tol) creditedAs = "belief6";

        if (!creditedAs) { await db.collection("tokenTransfers").doc(sig.signature).set({ fromWallet, tokenAmount, matchedUserId: user.id, creditedAs: null, note: "amount mismatch", processedAt: Timestamp.now() }); continue; }

        const slotNum  = creditedAs === "belief4" ? 4 : creditedAs === "belief5" ? 5 : 6;
        const bRef     = db.collection("dream_beliefs").doc(`${roundId}_${user.id}`);
        const bSnap    = await bRef.get();
        const purchased = slotNum - 3;
        if (bSnap.exists) {
          if ((bSnap.data().purchasedBeliefs || 0) < purchased) await bRef.update({ purchasedBeliefs: purchased });
        } else {
          await bRef.set({ roundId, userId: user.id, walletAddress: fromWallet, dreamIds: [], beliefTimestamps: {}, totalBeliefs: 0, purchasedBeliefs: purchased, createdAt: Timestamp.now() });
        }

        await db.collection("tokenTransfers").doc(sig.signature).set({ fromWallet, tokenAmount, matchedUserId: user.id, creditedAs, roundId, processedAt: Timestamp.now() });
        log(`[engine] ${fromWallet.slice(0, 8)}… unlocked ${creditedAs}`);
      } catch (e) { log(`[engine] transferTick sig error: ${e.message}`); }
      await sleep(300);
    }
  } catch (e) { log(`[engine] transferTick error: ${e.message}`); }
}

// ── START SERVER + ENGINE ────────────────────────────────────
app.listen(PORT, () => {
  log(`Server running on :${PORT}`);
  log(`Engine starting — round duration: ${ROUND_MS / 3600000}h, gas reserve: ◎${GAS_RESERVE}`);

  // Seed lastTransferSig on boot
  connection.getSignaturesForAddress(new PublicKey(CREATOR_WALLET), { limit: 1 })
    .then(sigs => { if (sigs.length) lastTransferSig = sigs[0].signature; })
    .catch(() => {});

  // Boot the engine
  roundTick();
  balanceTick();
  startAutoClaimFees(connection, creatorKP, log);

  setInterval(roundTick,   10_000);
  setInterval(balanceTick, 15_000);
  setInterval(holderTick,  300_000);
  setInterval(transferTick, 30_000);
});