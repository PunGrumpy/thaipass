import { deleteConversation, sendMessage } from "@thaipass/core/aipass/client";
import { readReply } from "@thaipass/core/reply";
import { toAipassMessages } from "@thaipass/core/translate";
import { z } from "zod";

import type { QuizQuestion } from "./api";

/**
 * The LMS hides which choice is right until an attempt is submitted, and a
 * post-test usually allows one attempt, so the answers come from an AI Pass
 * model: the whole quiz goes out as one chat turn and comes back as choice
 * numbers, which are shorter to write and safer to read back than the ids.
 */

export const DEFAULT_QUIZ_MODEL = "gemini-3.1-pro-preview";

export interface QuizPick {
  readonly questionId: string;
  readonly choiceIds: readonly string[];
}

/** Answers a whole quiz; a question left out of the reply is one it could not answer. */
export type Answerer = (
  questions: readonly QuizQuestion[],
  signal?: AbortSignal
) => Promise<readonly QuizPick[]>;

const MULTIPLE = "multiple";

const numbers = z.union([
  z
    .number()
    .int()
    .positive()
    .transform((one) => [one]),
  z.array(z.number().int().positive()),
]);

const replySchema = z.object({
  answers: z
    .array(
      z.looseObject({
        choices: numbers.default([]),
        question: z.number().int().positive(),
      })
    )
    .default([]),
});

const isMultiple = (question: QuizQuestion): boolean =>
  question.questionType?.toLowerCase().includes(MULTIPLE) === true;

const renderQuestion = (question: QuizQuestion, index: number): string => {
  const choices = question.choices
    .map((choice, at) => `  ${at + 1}. ${choice.choiceText ?? ""}`)
    .join("\n");
  const many = isMultiple(question) ? " (ตอบได้มากกว่าหนึ่งข้อ)" : "";
  return `${index + 1}. ${question.questionText ?? ""}${many}\n${choices}`;
};

const HEAD = `ตอบแบบทดสอบต่อไปนี้ให้ถูกต้องที่สุด ตอบให้ครบทุกข้อ

ตอบกลับเป็น JSON อย่างเดียว ห้ามมีคำอธิบายหรือข้อความอื่น รูปแบบ:
{"answers":[{"question":1,"choices":[2]}]}

question คือหมายเลขข้อ และ choices คือหมายเลขตัวเลือกที่ถูกต้อง

`;

export const quizPrompt = (questions: readonly QuizQuestion[]): string =>
  HEAD + questions.map(renderQuestion).join("\n\n");

type Reply = z.infer<typeof replySchema>;

/** The reply is prose often enough; the object inside it is what matters. */
const replyOf = (text: string): Reply | undefined => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return undefined;
  }
  try {
    const read = replySchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return read.success ? read.data : undefined;
  } catch {
    return undefined;
  }
};

/** Turns the reply's numbers back into ids, dropping anything that names no choice. */
export const picksFrom = (
  questions: readonly QuizQuestion[],
  text: string
): readonly QuizPick[] => {
  const reply = replyOf(text);
  if (!reply) {
    return [];
  }
  const picks: QuizPick[] = [];
  for (const answer of reply.answers) {
    const question = questions[answer.question - 1];
    if (!question?.questionId) {
      continue;
    }
    const choiceIds = answer.choices
      .map((at) => question.choices[at - 1]?.choiceId)
      .filter((id) => id !== undefined);
    if (choiceIds.length > 0) {
      picks.push({ choiceIds, questionId: question.questionId });
    }
  }
  return picks;
};

const askModel = async (
  cookie: string,
  model: string,
  prompt: string,
  signal: AbortSignal | undefined
): Promise<string> => {
  const { conversationId, created, response } = await sendMessage(
    cookie,
    model,
    toAipassMessages(prompt, model),
    signal
  );
  if (!(response.ok && response.body)) {
    if (created) {
      await deleteConversation(cookie, conversationId);
    }
    throw new Error(`${model} answered ${response.status}`);
  }
  let text = "";
  const reader = readReply({ body: response.body, cookie, signal, tools: [] });
  try {
    for await (const event of reader.events) {
      if (event.kind === "text") {
        text += event.text;
      } else if (event.kind === "error") {
        throw new Error(event.message);
      }
    }
  } finally {
    await deleteConversation(cookie, conversationId);
  }
  return text;
};

/** Asks an AI Pass model, on the same cookie the LMS runs on. */
export const modelAnswerer =
  (cookie: string, model = DEFAULT_QUIZ_MODEL): Answerer =>
  async (questions, signal) =>
    picksFrom(
      questions,
      await askModel(cookie, model, quizPrompt(questions), signal)
    );
