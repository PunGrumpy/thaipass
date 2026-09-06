import { NoSuchModelError } from "@ai-sdk/provider";
import type { LanguageModelV2 } from "@ai-sdk/provider";

import { DEFAULT_MODEL, kindOf } from "../aipass/models";
import type { KnownChatModel } from "../aipass/models";
import { configure } from "../lib/config";
import type { ConfigChanges, UpstreamLogger } from "../lib/config";
import { aipassModel } from "./model";

/** The known ids complete in an editor; any other string is left to the catalog. */
export type AipassModelId = KnownChatModel | (string & Record<never, never>);

export interface AipassProviderSettings {
  /** The Cookie header of a browser signed in to AI Pass. */
  readonly cookie: string;
  /**
   * The AI Pass origin, https://de.aipass.net by default. One origin serves
   * the whole process, so the last provider to name one wins.
   */
  readonly origin?: string;
  /** Receives the warnings the proxy has no reply to attach to; silent by default. */
  readonly logger?: UpstreamLogger;
}

export interface AipassProvider {
  (modelId?: AipassModelId): LanguageModelV2;
  readonly languageModel: (modelId?: string) => LanguageModelV2;
}

export const createAipass = (
  settings: AipassProviderSettings
): AipassProvider => {
  const changes: ConfigChanges = {};
  if (settings.origin !== undefined) {
    changes.origin = settings.origin;
  }
  if (settings.logger !== undefined) {
    changes.logger = settings.logger;
  }
  if (Object.keys(changes).length > 0) {
    configure(changes);
  }
  /**
   * Whether the account's catalog lists the id is only known once a call
   * carries the cookie upstream, so that check is made on the first call.
   * What can be refused here is an empty id or one that makes media.
   */
  const languageModel = (modelId: string = DEFAULT_MODEL): LanguageModelV2 => {
    if (modelId.length === 0 || kindOf(modelId) !== "chat") {
      throw new NoSuchModelError({ modelId, modelType: "languageModel" });
    }
    return aipassModel(settings.cookie, modelId);
  };
  return Object.assign(languageModel, { languageModel });
};
