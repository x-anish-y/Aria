/**
 * lib/audio/indexeddb-audio.js — Client-Side Audio Recording Storage
 *
 * Requirements (Task 16):
 * - Keeps recording blobs in browser memory / IndexedDB for this session only.
 * - Strict Privacy: Audio blobs are NEVER uploaded to any server.
 */

const DB_NAME = "aria_session_audio";
const DB_VERSION = 1;
const STORE_NAME = "call_recordings";

let dbPromise = null;

function getDB() {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn("[idb-audio] Failed to open IndexedDB:", request.error);
        resolve(null);
      };
    });
  }

  return dbPromise;
}

/**
 * Save an audio recording Blob to IndexedDB for the current session.
 *
 * @param {string} id - Call ID or session call key
 * @param {Blob} blob - Audio blob
 * @param {object} [metadata] - Duration, mode, timestamps
 */
export async function saveSessionRecording(id, blob, metadata = {}) {
  if (!id || !blob) return null;
  const db = await getDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const record = {
        id: String(id),
        blob,
        mimeType: blob.type,
        size: blob.size,
        savedAt: Date.now(),
        ...metadata,
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => {
        console.warn("[idb-audio] saveSessionRecording error:", req.error);
        resolve(null);
      };
    } catch (err) {
      console.warn("[idb-audio] saveSessionRecording exception:", err);
      resolve(null);
    }
  });
}

/**
 * Retrieve an audio recording Blob from IndexedDB.
 *
 * @param {string} id - Call ID
 * @returns {Promise<{ blob: Blob, url: string, metadata: object } | null>}
 */
export async function getSessionRecording(id) {
  if (!id) return null;
  const db = await getDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(String(id));

      req.onsuccess = () => {
        const record = req.result;
        if (record?.blob) {
          const url = URL.createObjectURL(record.blob);
          resolve({ ...record, url });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Clear all recordings from IndexedDB (session reset / logout)
 */
export async function clearSessionRecordings() {
  const db = await getDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
