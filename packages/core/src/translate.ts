import type { AipassMessage } from "./aipass/stream";
import { renderCall, renderToolGuide } from "./tools";
import type { ToolCall, ToolDefinition } from "./tools";

export type TurnRole = "system" | "user" | "assistant" | "tool";

/** Files ride beside the text: they are uploaded before the turn is sent, not flattened into it. */
export interface TurnFile {
  readonly uri: string;
  readonly filename?: string;
}

/**
 * One turn in the shape every protocol reduces to. `calls` and `callId` are
 * rendered back into the text protocol so the model sees its own past calls.
 */
export interface ChatTurn {
  readonly role: TurnRole;
  readonly content: string;
  readonly calls?: readonly ToolCall[];
  readonly callId?: string;
  readonly files?: readonly TurnFile[];
}

export interface Conversation {
  readonly turns: readonly ChatTurn[];
  readonly tools: readonly ToolDefinition[];
}

export const filesOf = (conversation: Conversation): readonly TurnFile[] =>
  conversation.turns.flatMap((turn) => turn.files ?? []);

const toolNames = (turns: readonly ChatTurn[]): Map<string, string> => {
  const names = new Map<string, string>();
  for (const turn of turns) {
    for (const call of turn.calls ?? []) {
      names.set(call.id, call.name);
    }
  }
  return names;
};

const roleLabel = (turn: ChatTurn, names: Map<string, string>): string => {
  if (turn.role === "assistant") {
    return "Assistant";
  }
  if (turn.role === "tool") {
    const name = turn.callId === undefined ? undefined : names.get(turn.callId);
    return name === undefined ? "Tool" : `Tool (${name})`;
  }
  return "User";
};

const turnText = (turn: ChatTurn): string => {
  const text = turn.content.trim();
  const calls = (turn.calls ?? []).map(renderCall);
  return [text, ...calls].filter((part) => part.length > 0).join("\n\n");
};

/**
 * Stands in for a caller who sent no system message, so the tool guide below
 * it reads as instruction rather than as a description of tools that live
 * somewhere else.
 *
 * Measured 2026-09-19 against ten models, one request at a time with the
 * conditions interleaved, five rounds each: with a single tool attached and
 * no system message, `gpt-5.6-sol` and `gpt-5.6-terra` never called it,
 * `gemini-3.1-pro-preview` and `glm-5.3` managed 2/5, `Kimi-K2.7-Code` 3/5
 * and `grok-4.3` 4/5. `gpt-5.6-sol` said why: "I can't access the
 * select_choice tool here". It could see the name, so the guide had arrived.
 * With one line of system ahead of it, all ten called the tool on every
 * round. Graders in the autoevals shape send one user message and no system
 * message, which is how this surfaced.
 */
const IMPLIED_SYSTEM =
  "You are an assistant with the tools described below. Call them when they apply.";

export const flattenPrompt = ({ tools, turns }: Conversation): string => {
  const system = turns
    .filter((turn) => turn.role === "system")
    .map((turn) => turn.content)
    .filter((text) => text.length > 0)
    .join("\n\n");
  const convo = turns.filter((turn) => turn.role !== "system");
  const lone = system.length === 0 && tools.length === 0 && convo.length === 1;

  if (lone && convo[0]?.role === "user" && convo[0].calls === undefined) {
    return convo[0].content;
  }

  const blocks: string[] = [];
  if (system.length > 0) {
    blocks.push(system.trim());
  } else if (tools.length > 0) {
    blocks.push(IMPLIED_SYSTEM);
  }
  if (tools.length > 0) {
    blocks.push(renderToolGuide(tools));
  }
  const names = toolNames(convo);
  const lines: string[] = [];
  for (const turn of convo) {
    const text = turnText(turn);
    if (text.length === 0) {
      continue;
    }
    lines.push(`${roleLabel(turn, names)}: ${text}`);
  }
  if (lines.length > 0) {
    blocks.push(lines.join("\n\n"));
  }
  return blocks.join("\n\n");
};

export const toAipassMessages = (
  prompt: string,
  modelId: string
): AipassMessage[] => [
  {
    id: crypto.randomUUID(),
    metadata: { modelId },
    parts: [{ text: prompt, type: "text" }],
    role: "user",
  },
];
