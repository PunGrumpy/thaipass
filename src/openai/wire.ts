export interface ChatDelta {
  role?: "assistant";
  content?: string;
}

export interface ChatCompletionChunk {
  readonly choices: readonly {
    readonly delta: ChatDelta;
    readonly finish_reason: string | null;
    readonly index: number;
  }[];
  readonly created: number;
  readonly id: string;
  readonly model: string;
  readonly object: "chat.completion.chunk";
}

export interface ChatCompletion {
  readonly choices: readonly {
    readonly finish_reason: string;
    readonly index: number;
    readonly message: { readonly content: string; readonly role: "assistant" };
  }[];
  readonly created: number;
  readonly id: string;
  readonly model: string;
  readonly object: "chat.completion";
  readonly usage: {
    readonly completion_tokens: number;
    readonly prompt_tokens: number;
    readonly total_tokens: number;
  };
}

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export const chatChunk = (
  id: string,
  model: string,
  delta: ChatDelta,
  finishReason: string | null
): ChatCompletionChunk => ({
  choices: [{ delta, finish_reason: finishReason, index: 0 }],
  created: nowSeconds(),
  id,
  model,
  object: "chat.completion.chunk",
});

export const chatCompletion = (
  id: string,
  model: string,
  content: string,
  finishReason: string
): ChatCompletion => ({
  choices: [
    {
      finish_reason: finishReason,
      index: 0,
      message: { content, role: "assistant" },
    },
  ],
  created: nowSeconds(),
  id,
  model,
  object: "chat.completion",
  usage: { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0 },
});
