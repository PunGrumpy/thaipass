import { z } from "zod";

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
  "openai-deep-research",
  "openthai2.0-legal@jts",
  "sonar",
  "sonar-reasoning-pro",
  "sonar-deep-research",
] as const;

export const MEDIA_MODELS = [
  "gpt-image-2",
  "gemini-3-pro-image",
  "gemini-2.5-flash-image",
  "seedream-4.0",
  "seedream-5.0-lite",
  "seedance-2.0",
  "seedance-2.0-fast",
  "seedance-2.0-mini",
  "veo-3.1-fast-generate-001",
  "lyria-3-pro-preview",
  "lyria-3-clip-preview",
] as const;

export const chatModelSchema = z.enum(CHAT_MODELS, {
  error: "unknown model, see GET /v1/models",
});

export type ChatModel = z.infer<typeof chatModelSchema>;

export const DEFAULT_MODEL: ChatModel = "gemini-3.1-flash-lite";
