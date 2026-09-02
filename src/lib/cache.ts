export interface TtlCache<T> {
  readonly get: (key: string) => T | undefined;
  readonly set: (key: string, value: T) => void;
}

interface Entry<T> {
  readonly expiresAt: number;
  readonly value: T;
}

export const ttlCache = <T>(ttlMs: number): TtlCache<T> => {
  const entries = new Map<string, Entry<T>>();
  return {
    get: (key) => {
      const now = Date.now();
      for (const [id, entry] of entries) {
        if (entry.expiresAt <= now) {
          entries.delete(id);
        }
      }
      return entries.get(key)?.value;
    },
    set: (key, value) => {
      entries.set(key, { expiresAt: Date.now() + ttlMs, value });
    },
  };
};
