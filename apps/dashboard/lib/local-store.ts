/**
 * localStorage as an external store, so React reads it through
 * `useSyncExternalStore` instead of copying it into state after mount.
 */

const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const subscribeLocal = (listener: () => void): (() => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

export const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    // A browser with site data blocked still gets a working in-memory session.
    return null;
  }
};

export const writeLocal = (key: string, value: string): void => {
  try {
    if (value === "") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Same as above: refusing to persist must not break the page.
  }
  notify();
};
