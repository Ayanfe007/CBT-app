/**
 * Tiny IndexedDB wrapper for offline persistence.
 *
 * Stores:
 *  - pending_answers: answers not yet synced to the server (idempotent by seq)
 *  - session_cache: the full test payload (questions, orders, ends_at) so a
 *    refresh/reconnect restores the same shuffled test with zero network calls
 *
 * Never stores correct answers or PIN hashes.
 */

const DB_NAME = 'cbt-app';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('pending_answers')) {
        const store = db.createObjectStore('pending_answers', { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains('session_cache')) {
        db.createObjectStore('session_cache', { keyPath: 'sessionId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

type StoreName = 'pending_answers' | 'session_cache';

async function withStore<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => T): Promise<T> {
  const db = await getDB();
  const tx = db.transaction(store, mode);
  return new Promise<T>((resolve, reject) => {
    tx.oncomplete = () => resolve(fn(tx.objectStore(store)));
    tx.onerror = () => reject(tx.error);
  });
}

/** Pending answer entry. */
export interface PendingAnswer {
  id: string; // `${sessionId}:${questionId}`
  sessionId: string;
  questionId: string;
  letter: string;
  seq: number;
  ts: number;
}

/** Save or upsert a pending answer. */
export async function savePendingAnswer(a: PendingAnswer) {
  return withStore('pending_answers', 'readwrite', (s) => {
    s.put(a);
    return true;
  });
}

/** Remove a pending answer once synced. */
export async function removePendingAnswer(id: string) {
  return withStore('pending_answers', 'readwrite', (s) => {
    s.delete(id);
    return true;
  });
}

/** Get all pending answers for a session, newest seq first per question. */
export async function getPendingAnswers(sessionId: string): Promise<PendingAnswer[]> {
  return withStore('pending_answers', 'readonly', (s) => {
    return new Promise<PendingAnswer[]>((resolve, reject) => {
      const idx = s.index('sessionId');
      const req = idx.getAll(IDBKeyRange.only(sessionId));
      req.onsuccess = () => resolve(req.result as PendingAnswer[]);
      req.onerror = () => reject(req.error);
    });
  });
}

/** Clear all pending answers for a session (after successful submit). */
export async function clearPendingAnswers(sessionId: string) {
  return withStore('pending_answers', 'readwrite', (s) => {
    const idx = s.index('sessionId');
    const req = idx.getAll(IDBKeyRange.only(sessionId));
    req.onsuccess = () => {
      (req.result as PendingAnswer[]).forEach((a) => s.delete(a.id));
    };
    return true;
  });
}

/** Session cache shape. */
export interface SessionCache {
  sessionId: string;
  courseId: string;
  endsAt: string;
  durationMinutes: number;
  questions: Array<{
    id: string;
    question_text: string;
    options: { A: string; B: string; C: string; D: string };
  }>;
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  startedAt: string;
}

/** Cache the full test payload for offline resume. */
export async function cacheSession(data: SessionCache) {
  return withStore('session_cache', 'readwrite', (s) => {
    s.put(data);
    return true;
  });
}

/** Fetch cached session payload. */
export async function getCachedSession(sessionId: string): Promise<SessionCache | null> {
  return withStore('session_cache', 'readonly', (s) => {
    return new Promise<SessionCache | null>((resolve, reject) => {
      const req = s.get(sessionId);
      req.onsuccess = () => resolve((req.result as SessionCache) ?? null);
      req.onerror = () => reject(req.error);
    });
  });
}

/** Remove cached session. */
export async function removeCachedSession(sessionId: string) {
  return withStore('session_cache', 'readwrite', (s) => {
    s.delete(sessionId);
    return true;
  });
}
