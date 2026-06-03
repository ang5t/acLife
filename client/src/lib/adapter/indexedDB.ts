import type { StorageAdapter } from "@/types/Storage";

export function indexedDBAdapter<T extends object>(
  dbName: string,
  storeName: string,
  initial: T,
): StorageAdapter<T> {
  const openDB = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  const putItem = (db: IDBDatabase, value: T) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.put(value, "data");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

  const getItem = (db: IDBDatabase): Promise<T | null> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.get("data");
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });

  const removeItem = (db: IDBDatabase) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.delete("data");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

  return {
    async load(): Promise<T> {
      const db = await openDB();
      return (await getItem(db)) ?? initial;
    },
    async save(state: T): Promise<void> {
      const db = await openDB();
      await putItem(db, state);
    },
    async remove(key: keyof T): Promise<void> {
      const db = await openDB();
      const current = (await getItem(db)) ?? initial;

      delete current[key];

      await putItem(db, current);
    },
    async clear(): Promise<void> {
      const db = await openDB();
      await removeItem(db);
    },
  };
}
