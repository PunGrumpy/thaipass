import type {
  LanguageModelV2CallWarning,
  LanguageModelV2Prompt,
} from "@ai-sdk/provider";

import type { OpenAIMessage } from "../openai/schema";

export interface ConvertedPrompt {
  readonly messages: OpenAIMessage[];
  readonly warnings: LanguageModelV2CallWarning[];
}

export const convertPrompt = (
  prompt: LanguageModelV2Prompt
): ConvertedPrompt => {
  const messages: OpenAIMessage[] = [];
  const dropped = new Set<string>();
  for (const message of prompt) {
    if (message.role === "system") {
      messages.push({ content: message.content, role: "system" });
      continue;
    }
    const text: string[] = [];
    for (const part of message.content) {
      if (part.type === "text" || part.type === "reasoning") {
        text.push(part.text);
      } else {
        dropped.add(part.type);
      }
    }
    messages.push({ content: text.join(""), role: message.role });
  }
  const warnings: LanguageModelV2CallWarning[] = [];
  if (dropped.size > 0) {
    warnings.push({
      message: `the provider dropped ${[...dropped].toSorted().join(", ")} parts because AI Pass reads text only`,
      type: "other",
    });
  }
  return { messages, warnings };
};
