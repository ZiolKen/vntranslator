const DB_NAME = "prenpy-db";
const DB_VERSION = 1;
const STORE = "kv";
const WORKSPACE_KEY = "workspace:v3";
const SESSION_KEY = "apiKey:v1";

const openDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onerror = () => reject(req.error || new Error("IDB open failed"));
  req.onsuccess = () => resolve(req.result);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
  };
});

export const loadWorkspace = async () => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const st = tx.objectStore(STORE);
    const req = st.get(WORKSPACE_KEY);
    req.onerror = () => reject(req.error || new Error("IDB read failed"));
    req.onsuccess = () => resolve(req.result || null);
  });
};

export const saveWorkspace = async (ws) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const st = tx.objectStore(STORE);
    const req = st.put(ws, WORKSPACE_KEY);
    req.onerror = () => reject(req.error || new Error("IDB write failed"));
    req.onsuccess = () => resolve(true);
  });
};

export const clearWorkspace = async () => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const st = tx.objectStore(STORE);
    const req = st.delete(WORKSPACE_KEY);
    req.onerror = () => reject(req.error || new Error("IDB delete failed"));
    req.onsuccess = () => resolve(true);
  });
};

export const getSessionApiKey = () => sessionStorage.getItem(SESSION_KEY) || "";

export const setSessionApiKey = (key) => {
  const s = String(key || "").trim();
  if (!s) return;
  sessionStorage.setItem(SESSION_KEY, s);
};
