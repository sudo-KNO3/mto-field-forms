// Minimal IndexedDB wrapper. One store, one JSON record per filled-out form:
// { id, formId, createdAt, updatedAt, complete, exportedAt, data: { fieldKey: value } }
// Photos, sketches and signatures are stored inside `data` as JPEG/PNG data URLs.

const DB_NAME = 'mto-field-forms';
const STORE = 'entries';
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('updatedAt', 'updatedAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  all: async () => (await tx('readonly', (s) => s.getAll())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  get: (id) => tx('readonly', (s) => s.get(id)),
  put: (entry) => tx('readwrite', (s) => { s.put(entry); }),
  delete: (id) => tx('readwrite', (s) => { s.delete(id); }),
};

// Ask the browser not to evict our data under storage pressure.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not supported */ }
}

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
