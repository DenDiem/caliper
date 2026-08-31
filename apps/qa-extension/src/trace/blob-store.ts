const DB_NAME = 'caliper-trace';
const STORE = 'blobs';
const VERSION = 1;

// Traces carry megabytes of video and replay. chrome.storage.local holds the manifest and the small
// screenshot data-URLs, but stuffing a WebM in beside them makes every manifest read pay for it.
const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const putBlob = (key: string, value: string): Promise<IDBValidKey> =>
  withStore('readwrite', (store) => store.put(value, key));

export const getBlob = (key: string): Promise<string | undefined> =>
  withStore<string | undefined>('readonly', (store) => store.get(key));

export const deleteBlob = (key: string): Promise<undefined> =>
  withStore<undefined>('readwrite', (store) => store.delete(key));

export const traceBlobKeys = (traceId: string): readonly string[] => [
  `${traceId}:detail`,
  `${traceId}:replay`,
  `${traceId}:video`,
];
