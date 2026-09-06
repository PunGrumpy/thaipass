export interface SseStreamOptions {
  readonly pauseMs?: number;
}

export const sseStream = (
  frames: readonly string[],
  options: SseStreamOptions = {}
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const frame = frames[index];
      if (frame === undefined) {
        controller.close();
        return;
      }
      if (options.pauseMs !== undefined) {
        await Bun.sleep(options.pauseMs);
      }
      controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      index += 1;
    },
  });
};
