import type { AipassMessage } from "./aipass/stream";
import type { OpenAIMessage, OpenAIRole } from "./openai/schema";

const roleLabel = (role: OpenAIRole): string => {
  if (role === "assistant") {
    return "Assistant";
  }
  if (role === "tool") {
    return "Tool";
  }
  return "User";
};

const flattenConversation = (messages: readonly OpenAIMessage[]): string => {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .filter((text) => text.length > 0)
    .join("\n\n");
  const convo = messages.filter((m) => m.role !== "system");

  if (system.length === 0 && convo.length === 1 && convo[0]?.role === "user") {
    return convo[0].content;
  }

  const blocks: string[] = [];
  if (system.length > 0) {
    blocks.push(system.trim());
  }
  const lines: string[] = [];
  for (const message of convo) {
    const text = message.content.trim();
    if (text.length === 0) {
      continue;
    }
    lines.push(`${roleLabel(message.role)}: ${text}`);
  }
  if (lines.length > 0) {
    blocks.push(lines.join("\n\n"));
  }
  return blocks.join("\n\n");
};

export const toAipassMessages = (
  messages: readonly OpenAIMessage[],
  modelId: string
): AipassMessage[] => [
  {
    id: crypto.randomUUID(),
    metadata: { modelId },
    parts: [{ text: flattenConversation(messages), type: "text" }],
    role: "user",
  },
];
