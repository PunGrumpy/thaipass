import { expect, test } from "bun:test";

import { picksFrom, quizPrompt } from "./answer";
import { quizContentSchema } from "./api";
import type { QuizQuestion } from "./api";

const QUESTIONS: readonly QuizQuestion[] = quizContentSchema.parse({
  questions: [
    {
      choices: [
        { choiceId: "ch-1", choiceText: "หนึ่ง" },
        { choiceId: "ch-2", choiceText: "สอง" },
      ],
      questionId: "q-1",
      questionText: "ข้อไหนถูก",
      questionType: "single_choice",
    },
    {
      choices: [
        { choiceId: "ch-3", choiceText: "สาม" },
        { choiceId: "ch-4", choiceText: "สี่" },
      ],
      questionId: "q-2",
      questionText: "ข้อไหนถูกบ้าง",
      questionType: "multiple_choice",
    },
  ],
}).questions;

test("numbers the questions and their choices for the model", () => {
  const prompt = quizPrompt(QUESTIONS);
  expect(prompt).toContain('{"answers":[{"question":1,"choices":[2]}]}');
  expect(prompt).toContain("1. ข้อไหนถูก\n  1. หนึ่ง\n  2. สอง");
  expect(prompt).toContain("2. ข้อไหนถูกบ้าง (ตอบได้มากกว่าหนึ่งข้อ)");
});

test("reads the choice ids back out of the numbers the model answered with", () => {
  expect(
    picksFrom(
      QUESTIONS,
      '{"answers":[{"question":1,"choices":[2]},{"question":2,"choices":[1,2]}]}'
    )
  ).toEqual([
    { choiceIds: ["ch-2"], questionId: "q-1" },
    { choiceIds: ["ch-3", "ch-4"], questionId: "q-2" },
  ]);
});

test("finds the answer inside a reply that fenced it or talked around it", () => {
  const fenced = '```json\n{"answers":[{"question":1,"choices":[1]}]}\n```';
  expect(picksFrom(QUESTIONS, fenced)).toEqual([
    { choiceIds: ["ch-1"], questionId: "q-1" },
  ]);
  expect(
    picksFrom(QUESTIONS, 'นี่คือคำตอบ {"answers":[{"question":1,"choices":1}]}')
  ).toEqual([{ choiceIds: ["ch-1"], questionId: "q-1" }]);
});

test("drops an answer that names no question or no choice of it", () => {
  expect(
    picksFrom(
      QUESTIONS,
      '{"answers":[{"question":9,"choices":[1]},{"question":1,"choices":[7]},{"question":2,"choices":[]}]}'
    )
  ).toEqual([]);
});

test("answers nothing when the reply carries no readable object", () => {
  expect(picksFrom(QUESTIONS, "ขออภัย ตอบไม่ได้")).toEqual([]);
  expect(picksFrom(QUESTIONS, "{not json}")).toEqual([]);
  expect(picksFrom(QUESTIONS, '{"answers":"two"}')).toEqual([]);
});
