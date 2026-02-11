(function () {
  'use strict';

  const DB_NAME = 'vntranslator-renpy';
  const DB_VERSION = 1;
  const STORE_SESSIONS = 'sessions';
  const STORE_DIALOGS = 'dialogs';

  let dbPromise;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
          sessions.createIndex('byUpdatedAt', 'updatedAt', { unique: false });
          sessions.createIndex('byCreatedAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_DIALOGS)) {
          const dialogs = db.createObjectStore(STORE_DIALOGS, { keyPath: ['sessionId', 'idx'] });
          dialogs.createIndex('bySession', 'sessionId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB.'));
    });
    return dbPromise;
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB request failed.'));
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    });
  }

  function createId() {
    const c = window.crypto || window.msCrypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    const bytes = new Uint8Array(16);
    if (!c || typeof c.getRandomValues !== 'function') {
      const hex = Array.from(bytes, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
      return (
        hex.slice(0, 8) + '-' +
        hex.slice(8, 12) + '-' +
        hex.slice(12, 16) + '-' +
        hex.slice(16, 20) + '-' +
        hex.slice(20)
      );
    }
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return (
      hex.slice(0, 8) + '-' +
      hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' +
      hex.slice(20)
    );
  }

  async function createSession(input) {
    const db = await openDb();
    const now = Date.now();
    const id = createId();

    const fileName = String(input?.fileName || 'script.rpy');
    const originalText = String(input?.originalText || '');
    const targetLang = String(input?.targetLang || 'English');
    const model = String(input?.model || 'deepseek');
    const dialogs = Array.isArray(input?.dialogs) ? input.dialogs : [];

    const session = {
      id,
      createdAt: now,
      updatedAt: now,
      version: 1,
      fileName,
      targetLang,
      model,
      dialogCount: dialogs.length,
      originalText,
    };

    const tx = db.transaction([STORE_SESSIONS, STORE_DIALOGS], 'readwrite');
    tx.objectStore(STORE_SESSIONS).put(session);

    const dialogStore = tx.objectStore(STORE_DIALOGS);
    for (let i = 0; i < dialogs.length; i++) {
      const d = dialogs[i] || {};
      const translated = typeof d.translated === 'string' ? d.translated : '';
      dialogStore.put({
        sessionId: id,
        idx: i,
        lineIndex: Number.isFinite(d.lineIndex) ? d.lineIndex : null,
        contentStart: Number.isFinite(d.contentStart) ? d.contentStart : null,
        contentEnd: Number.isFinite(d.contentEnd) ? d.contentEnd : null,
        quoteChar: typeof d.quoteChar === 'string' ? d.quoteChar : '"',
        isTriple: Boolean(d.isTriple),
        quote: typeof d.quote === 'string' ? d.quote : '',
        maskedQuote: typeof d.maskedQuote === 'string' ? d.maskedQuote : '',
        placeholderMap: d.placeholderMap && typeof d.placeholderMap === 'object' ? d.placeholderMap : Object.create(null),
        machineTranslated: translated,
        translated,
        reviewed: false,
        updatedAt: now,
      });
    }

    await txDone(tx);
    return id;
  }

  async function getSession(sessionId) {
    const db = await openDb();
    const tx = db.transaction([STORE_SESSIONS], 'readonly');
    const session = await reqToPromise(tx.objectStore(STORE_SESSIONS).get(sessionId));
    await txDone(tx);
    return session || null;
  }

  async function listSessions(limit = 30) {
    const db = await openDb();
    const tx = db.transaction([STORE_SESSIONS], 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const index = store.index('byUpdatedAt');
    const out = [];
    await new Promise((resolve, reject) => {
      const req = index.openCursor(null, 'prev');
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) {
          resolve();
          return;
        }
        out.push(cur.value);
        if (out.length >= limit) {
          resolve();
          return;
        }
        cur.continue();
      };
      req.onerror = () => reject(req.error || new Error('Failed to read sessions.'));
    });
    await txDone(tx);
    return out;
  }

  async function getDialogs(sessionId) {
    const db = await openDb();
    const tx = db.transaction([STORE_DIALOGS], 'readonly');
    const store = tx.objectStore(STORE_DIALOGS);
    const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
    const out = [];

    await new Promise((resolve, reject) => {
      const req = store.openCursor(range, 'next');
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) {
          resolve();
          return;
        }
        out.push(cur.value);
        cur.continue();
      };
      req.onerror = () => reject(req.error || new Error('Failed to read dialogs.'));
    });

    await txDone(tx);
    return out;
  }

  async function putDialog(dialog) {
    const db = await openDb();
    const tx = db.transaction([STORE_DIALOGS], 'readwrite');
    tx.objectStore(STORE_DIALOGS).put(dialog);
    await txDone(tx);
  }

  async function touchSession(sessionId, patch) {
    const db = await openDb();
    const tx = db.transaction([STORE_SESSIONS], 'readwrite');
    const store = tx.objectStore(STORE_SESSIONS);
    const session = await reqToPromise(store.get(sessionId));
    if (!session) {
      await txDone(tx);
      return;
    }
    const next = { ...session, ...patch, id: session.id, updatedAt: Date.now() };
    store.put(next);
    await txDone(tx);
  }

  async function deleteSession(sessionId) {
    const db = await openDb();
    const tx = db.transaction([STORE_SESSIONS, STORE_DIALOGS], 'readwrite');
    const sessions = tx.objectStore(STORE_SESSIONS);
    const dialogs = tx.objectStore(STORE_DIALOGS);
    sessions.delete(sessionId);

    const index = dialogs.index('bySession');
    await new Promise((resolve, reject) => {
      const req = index.openCursor(IDBKeyRange.only(sessionId));
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) {
          resolve();
          return;
        }
        cur.delete();
        cur.continue();
      };
      req.onerror = () => reject(req.error || new Error('Failed to delete dialogs.'));
    });

    await txDone(tx);
  }

  window.VNDB = {
    openDb,
    createSession,
    getSession,
    listSessions,
    getDialogs,
    putDialog,
    touchSession,
    deleteSession,
  };
})();
