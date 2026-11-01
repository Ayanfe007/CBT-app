/**
 * IndexedDB helper — promise-based, each operation opens its own transaction.
 * IndexedDB is a BACKUP only: loading and submitting must NEVER wait on it.
 * If IndexedDB is unavailable or fails, we fall back to in-memory + localStorage.
 */

const DB_NAME = 'cbt-app';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
let idbAvailable = true;
let idbFailure: Error | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!idbAvailable) {
      reject(idbFailure ?? new Error('IndexedDB unavailable'));
      return;
    }
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
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

async function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDB();
  try {
    return await dbPromise;
  } catch (err) {
    idbAvailable = false;
    idbFailure = err as Error;
    throw err;
  }
}

export interface PendingAnswer {
  id: string;
  sessionId: string;
  questionId: string;
  letter: string;
  seq: number;
  ts: number;
}

export interface SessionCache {
  sessionId: string;
  endsAt: string;
  questions: Array<{
    id: string;
    question_text: string;
    options: { A: string; B: string; C: string; D: string };
  }>;
}

/**
 * Save a pending answer. Opens its own transaction, resolves on complete.
 * Never throws on failure — returns false so caller can ignore it.
 */
export async function savePendingAnswer(a: PendingAnswer): Promise<boolean> {
  if (!idbAvailable) return false;
  try {
    const db = await getDB();
    return new Promise<boolean>((resolve) => {
      const tx = db.transaction('pending_answers', 'readwrite');
      const store = tx.objectStore('pending_answers');
      store.put(a);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** Remove a pending answer. Never throws. */
export async function removePendingAnswer(id: string): Promise<boolean> {
  if (!idbAvailable) return false;
  try {
    const db = await getDB();
    return new Promise<boolean>((resolve) => {
      const tx = db.transaction('pending_answers', 'readwrite');
      const store = tx.objectStore('pending_answers');
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** Get all pending answers for a session. Never throws. */
export async function getPendingAnswers(sessionId: string): Promise<PendingAnswer[]> {
  if (!idbAvailable) return [];
  try {
    const db = await getDB();
    return new Promise<PendingAnswer[]>((resolve) => {
      const tx = db.transaction('pending_answers', 'readonly');
      const store = tx.objectStore('pending_answers');
      const idx = store.index('sessionId');
      const req = idx.getAll(IDBKeyRange.only(sessionId));
      req.onsuccess = () => resolve((req.result as PendingAnswer[]) ?? []);
      tx.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/** Clear all pending answers for a session. Never throws. */
export async function clearPendingAnswers(sessionId: string): Promise<void> {
  if (!idbAvailable) return;
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pending_answers', 'readwrite');
      const store = tx.objectStore('pending_answers');
      const idx = store.index('sessionId');
      const req = idx.getAll(IDBKeyRange.only(sessionId));
      req.onsuccess = () => {
        (req.result as PendingAnswer[]).forEach((a) => store.delete(a.id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      };
    });
  } catch {
    // ignore
  }
}

/** Cache the full test payload. Never throws. */
export async function cacheSession(data: SessionCache): Promise<boolean> {
  if (!idbAvailable) return false;
  try {
    const db = await getDB();
    return new Promise<boolean>((resolve) => {
      const tx = db.transaction('session_cache', 'readwrite');
      const store = tx.objectStore('session_cache');
      store.put(data);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** Fetch cached session payload. Never throws. */
export async function getCachedSession(sessionId: string): Promise<SessionCache | null> {
  if (!idbAvailable) return null;
  try {
    const db = await getDB();
    return new Promise<SessionCache | null>((resolve) => {
      const tx = db.transaction('session_cache', 'readonly');
      const store = tx.objectStore('session_cache');
      const req = store.get(sessionId);
      req.onsuccess = () => resolve((req.result as SessionCache) ?? null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Remove cached session. Never throws. */
export async function removeCachedSession(sessionId: string): Promise<void> {
  if (!idbAvailable) return;
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('session_cache', 'readwrite');
      const store = tx.objectStore('session_cache');
      store.delete(sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
