/**
 * AI Pass reports no token counts, so the proxy estimates them from the text.
 *
 * A token covers about four ASCII characters, and far fewer of anything else:
 * Thai, the other non-Latin scripts and emoji land nearer one and a half. The
 * two are counted apart so a Thai conversation is not reported at a third of
 * its size, which is what one ratio over the whole string would do.
 */

const ASCII = /[\u0020-\u007E\s]/gu;
const ASCII_CHARS_PER_TOKEN = 4;
const OTHER_CHARS_PER_TOKEN = 1.5;

/** A running count of the text one side of a turn amounted to. */
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
