import type { ChatTurn, TurnRole } from "@thaipass/core/translate";
import { z } from "zod";

export type ContentPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "file"; readonly uri: string; readonly filename?: string };

export const contentOf = (part: z.ZodType<ContentPart>) =>
  z
    .union([
      z.string().transform((text): ContentPart[] => [{ kind: "text", text }]),
      z.array(part),
      z.unknown().transform((): ContentPart[] => []),
    ])
    .optional()
    .transform((value): ContentPart[] => value ?? []);

export const turnOf = (
  role: TurnRole,
  parts: readonly ContentPart[]
): ChatTurn => {
  const content = parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text)
    .join("");
  const files = parts
    .filter((part) => part.kind === "file")
    .map((part) => ({ filename: part.filename, uri: part.uri }));
  return files.length > 0 ? { content, files, role } : { content, role };
};
