export interface TranscriptRecord {
  messageId: string;
  text: string;
  ts: number;
  modelId: string;
}

const DB_NAME = 'wt-transcripts';
const DB_VERSION = 1;
const STORE = 'transcripts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir IndexedDB'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'messageId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function getTranscript(messageId: string): Promise<TranscriptRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(messageId);
    req.onsuccess = () => resolve(req.result as TranscriptRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function putTranscript(record: TranscriptRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteTranscript(messageId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(messageId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearTranscripts(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getTranscriptsByIds(
  ids: string[],
): Promise<Record<string, TranscriptRecord>> {
  const out: Record<string, TranscriptRecord> = {};
  await Promise.all(
    ids.map(async (id) => {
      const rec = await getTranscript(id);
      if (rec) out[id] = rec;
    }),
  );
  return out;
}
