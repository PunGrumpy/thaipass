/**
 * AI Pass reports no token counts. ASCII runs about four characters per
 * token; Thai, other non-Latin scripts and emoji nearer one and a half, so
 * the two are counted apart.
 */

const ASCII = /[\u0020-\u007E\s]/gu;
const ASCII_CHARS_PER_TOKEN = 4;
const OTHER_CHARS_PER_TOKEN = 1.5;

export interface CharCount {
  ascii: number;
  other: number;
}

export const newCharCount = (): CharCount => ({ ascii: 0, other: 0 });

export const addText = (count: CharCount, text: string): void => {
  const ascii = text.match(ASCII)?.length ?? 0;
  count.ascii += ascii;
  count.other += text.length - ascii;
};

export const charTokens = (count: CharCount): number =>
  Math.ceil(
    count.ascii / ASCII_CHARS_PER_TOKEN + count.other / OTHER_CHARS_PER_TOKEN
  );

export const estimateTokens = (text: string): number => {
  const count = newCharCount();
  addText(count, text);
  return charTokens(count);
};
