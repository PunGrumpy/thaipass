/**
 * Canonical AI Pass chat model ids, taken from the SPA's `/chat.data` loader.
 *
 * These are case-sensitive, and Claude carries a `@provider` routing suffix.
 * Image, video, and audio models are left out because this proxy only speaks
 * chat completions.
 */
export const CHAT_MODELS = [
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "claude-opus-5@azure",
  "claude-sonnet-5@default",
  "gemini-3.1-pro-preview",
  "gemini-3.7-flash",
  "gemini-3.1-flash-lite",
  "glm-5.2",
  "grok-4.3",
  "DeepSeek-V3.2",
  "minimax-m2-maas",
  "qwen3-next-80b-a3b-instruct-maas",
  "Kimi-K2.7-Code",
  "Mistral-Large-3",
  "Mistral-Medium-3",
  "Llama-4-Scout-17B-16E-Instruct-1",
  "Llama-4-Maverick-17B-128E-Instruct-FP8-1",
  "pathumma-thaillm-8b",
  "sonar",
  "sonar-reasoning-pro",
  "sonar-deep-research",
] as const;

/** The one model that costs no credits, so it is the default. */
export const DEFAULT_MODEL = "gemini-3.1-flash-lite";
