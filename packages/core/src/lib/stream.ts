export interface GuardedController<T> {
  readonly enqueue: (chunk: T) => void;
  readonly close: () => void;
  readonly abandon: () => void;
  readonly isOpen: () => boolean;
}

export const guardController = <T>(
  controller: ReadableStreamDefaultController<T>
): GuardedController<T> => {
  let open = true;
  const attempt = (action: () => void): void => {
    if (!open) {
      return;
    }
    try {
      action();
    } catch {
      open = false;
    }
  };
  return {
    abandon: () => {
      open = false;
    },
    close: () => attempt(() => controller.close()),
    enqueue: (chunk) => attempt(() => controller.enqueue(chunk)),
    isOpen: () => open,
  };
};
