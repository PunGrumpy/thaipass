import { NoSuchModelError } from "@ai-sdk/provider";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { DEFAULT_MODEL, kindOf } from "@thaipass/core/aipass/models";
import type { KnownChatModel } from "@thaipass/core/aipass/models";
import { configure } from "@thaipass/core/lib/config";
import type { UpstreamLogger } from "@thaipass/core/lib/config";

import { aipassModel } from "./model";

/** The known ids complete in an editor; any other string is left to the catalog. */
export type AipassModelId = KnownChatModel | (string & Record<never, never>);

export interface AipassProviderSettings {
  /** The Cookie header of a browser signed in to AI Pass. */
  readonly cookie: string;
  /** Process-wide; defaults to https://de.aipass.net. */
  readonly origin?: string;
  /** Process-wide; silent by default. */
  readonly logger?: UpstreamLogger;
}

export interface AipassProvider {
  (modelId?: AipassModelId): LanguageModelV2;
  readonly languageModel: (modelId?: string) => LanguageModelV2;
}

export const createAipass = (
  settings: AipassProviderSettings
): AipassProvider => {
  if (settings.origin !== undefined) {
    configure({ origin: settings.origin });
  }
  if (settings.logger !== undefined) {
    configure({ logger: settings.logger });
  }
  // The catalog check needs the cookie, so it waits for the first call.
  const languageModel = (modelId: string = DEFAULT_MODEL): LanguageModelV2 => {
    if (modelId.length === 0 || kindOf(modelId) !== "chat") {
      throw new NoSuchModelError({ modelId, modelType: "languageModel" });
    }
    return aipassModel(settings.cookie, modelId);
  };
  return Object.assign(languageModel, { languageModel });
};
