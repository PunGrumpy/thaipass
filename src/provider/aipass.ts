import { NoSuchModelError } from "@ai-sdk/provider";
import type { LanguageModelV2 } from "@ai-sdk/provider";

import { chatModelSchema, DEFAULT_MODEL } from "../aipass/models";
import type { ChatModel } from "../aipass/models";
import { aipassModel } from "./model";

export interface AipassProviderSettings {
  readonly cookie: string;
}

export interface AipassProvider {
  (modelId?: ChatModel): LanguageModelV2;
  readonly languageModel: (modelId?: string) => LanguageModelV2;
}

export const createAipass = (
  settings: AipassProviderSettings
): AipassProvider => {
  const languageModel = (modelId: string = DEFAULT_MODEL): LanguageModelV2 => {
    const known = chatModelSchema.safeParse(modelId);
    if (!known.success) {
      throw new NoSuchModelError({ modelId, modelType: "languageModel" });
    }
    return aipassModel(settings.cookie, known.data);
  };
  return Object.assign(languageModel, { languageModel });
};
