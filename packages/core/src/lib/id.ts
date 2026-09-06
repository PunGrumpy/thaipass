/** The first `length` hex characters of a random UUID, for wire-visible ids. */
export const randomHex = (length: number): string =>
  crypto.randomUUID().replaceAll("-", "").slice(0, length);
