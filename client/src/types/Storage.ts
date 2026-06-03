import type { Encrypted } from "./Crypt";

type MaybePromise<T> = T | Promise<T>;

export interface StorageAdapter<T extends object> {
  load(): MaybePromise<T>;
  save(state: T): MaybePromise<void>;
  remove(key: keyof T): MaybePromise<void>;
  clear(): MaybePromise<void>;
}

export interface StorageData {
  offlineEvents: Encrypted | null;
  offlineMasterKey: string;
  cachedEvents: Encrypted | null;
  pushSubscription: string | null;
  pushDismissed: boolean;
  sidebarOpen: boolean;
}
