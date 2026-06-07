import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ── PASTE YOUR FIREBASE CONFIG HERE ─────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAx-AyJ1lUI4Rgh2rqxXUTLYqoIcBddFco",
  authDomain: "sol-153d8.firebaseapp.com",
  projectId: "sol-153d8",
  storageBucket: "sol-153d8.firebasestorage.app",
  messagingSenderId: "329991144311",
  appId: "1:329991144311:web:977fd10874b7b42c8c1772"
};
// ────────────────────────────────────────────────────────────

let app, db;

function init() {
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    db  = getFirestore(app);
  }
  return db;
}

export function getDb() { return init(); }

export function listenCurrentRound(cb) {
  const ref = doc(init(), 'dream_stats', 'currentRound');
  return onSnapshot(ref, s => cb(s.exists() ? s.data() : null));
}

export function listenGlobalStats(cb) {
  const ref = doc(init(), 'dream_stats', 'global');
  return onSnapshot(ref, s => cb(s.exists() ? s.data() : null));
}

export function listenTopDreams(cb) {
  const q = query(
    collection(init(), 'dreams'),
    where('isDeleted', '==', false),
    where('isRetired', '==', false),
    orderBy('beliefCount', 'desc'),
    limit(10)
  );
  return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function listenDream(dreamId, cb) {
  const ref = doc(init(), 'dreams', dreamId);
  return onSnapshot(ref, s => cb(s.exists() ? { id: s.id, ...s.data() } : null));
}

export function listenComments(dreamId, cb) {
  const q = query(
    collection(init(), 'dream_comments'),
    where('dreamId', '==', dreamId),
    orderBy('createdAt', 'asc'),
    limit(100)
  );
  return onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function uploadDreamImage(file) {
  const fbApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const storage = getStorage(fbApp);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const imageRef = ref(storage, `dream-images/${Date.now()}-${safeName}`);
  await uploadBytes(imageRef, file);
  return getDownloadURL(imageRef);
}
