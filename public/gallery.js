const DB_NAME = 'codevideo';
const DB_VERSION = 1;
const STORE = 'videos';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run(mode, action) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  }));
}

export async function listVideos() {
  const rows = await run('readonly', store => store.getAll());
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export function saveVideo(record) {
  return run('readwrite', store => store.put(record));
}

export function removeVideo(id) {
  return run('readwrite', store => store.delete(id));
}
