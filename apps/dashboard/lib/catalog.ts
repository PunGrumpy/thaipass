import {
  CHAT_MODELS,
  DEFAULT_MODEL as FREE_DEFAULT_MODEL,
  IMAGE_MODELS,
  MUSIC_MODELS,
  VIDEO_MODELS,
} from "@thaipass/core/aipass/models";

import type { CatalogModel, ModelKind } from "./proxy";

export const FREE_MODEL = FREE_DEFAULT_MODEL;

export const DEFAULT_MODEL = "claude-sonnet-5@azure";

export const MODEL_KINDS: readonly ModelKind[] = [
  "chat",
  "image",
  "video",
  "music",
];

export const KIND_LABELS: Record<ModelKind, string> = {
  chat: "Chat",
  image: "Image",
  music: "Audio",
  video: "Video",
};

const entry = (id: string, kind: ModelKind): CatalogModel => ({
  free: id === FREE_MODEL,
  id,
  kind,
  options: null,
  ready: true,
  thinking: null,
});

export const BUILTIN_CATALOG: readonly CatalogModel[] = [
  ...CHAT_MODELS.map((id) => entry(id, "chat")),
  ...IMAGE_MODELS.map((id) => entry(id, "image")),
  ...VIDEO_MODELS.map((id) => entry(id, "video")),
  ...MUSIC_MODELS.map((id) => entry(id, "music")),
];

interface VendorRule {
  label: string;
  match: RegExp;
  slug?: string;
}

const VENDOR_RULES: readonly VendorRule[] = [
  { label: "Anthropic", match: /^claude/iu, slug: "anthropic" },
  { label: "OpenAI", match: /^(?:gpt|openai|o\d)/iu, slug: "openai" },
  {
    label: "Google",
    match: /^(?:gemini|veo|lyria|imagen)/iu,
    slug: "google",
  },
  { label: "xAI", match: /^grok/iu, slug: "xai" },
  { label: "DeepSeek", match: /^deepseek/iu, slug: "deepseek" },
  { label: "Meta", match: /^llama/iu, slug: "meta" },
  { label: "Mistral", match: /^mistral/iu, slug: "mistral" },
  { label: "Qwen", match: /^qwen/iu, slug: "qwen" },
  { label: "Moonshot", match: /^kimi/iu, slug: "moonshot" },
  { label: "MiniMax", match: /^minimax/iu, slug: "minimax" },
  { label: "Zhipu", match: /^glm/iu, slug: "zhipu" },
  { label: "ByteDance", match: /^seed(?:ream|ance)/iu, slug: "bytedance" },
  { label: "Perplexity", match: /^sonar/iu, slug: "perplexity" },
  {
    label: "Thai NECTEC",
    match: /^(?:pathumma|openthai)/iu,
    slug: "pathumma",
  },
];

const OTHER: VendorRule = { label: "Other", match: /^/u };

export const vendorRuleOf = (id: string): VendorRule =>
  VENDOR_RULES.find((rule) => rule.match.test(id)) ?? OTHER;

export const vendorOf = (id: string): string => vendorRuleOf(id).label;

export const countByKind = (
  models: readonly CatalogModel[]
): Record<ModelKind, number> => {
  const counts: Record<ModelKind, number> = {
    chat: 0,
    image: 0,
    music: 0,
    video: 0,
  };
  for (const model of models) {
    counts[model.kind] += 1;
  }
  return counts;
};
