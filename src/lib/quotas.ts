import { z } from "zod";

import { config } from "./config.ts";

const QUOTA_PATH = "/loaders/get-usage-quota.data";
const QUOTA_ROUTE = "routes/loaders/get-usage-quota-status";
const MAX_DEPTH = 32;

type Cell =
  | {
      readonly kind: "scalar";
      readonly value: string | number | boolean | null;
    }
  | { readonly kind: "list"; readonly refs: readonly number[] }
  | { readonly kind: "object"; readonly entries: Record<string, number> };

type Decoded =
  | string
  | number
  | boolean
  | null
  | readonly Decoded[]
  | { readonly [key: string]: Decoded };

const cellSchema: z.ZodType<Cell> = z.union([
  z.array(z.number()).transform((refs): Cell => ({ kind: "list", refs })),
  z
    .record(z.string(), z.number())
    .transform((entries): Cell => ({ entries, kind: "object" })),
  z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .transform((value): Cell => ({ kind: "scalar", value })),
]);

const keyName = (cell: Cell | undefined): string | null => {
  if (cell?.kind !== "scalar") {
    return null;
  }
  const name = z.string().safeParse(cell.value);
  return name.success ? name.data : null;
};

const decodeTurboStream = (payload: string): Decoded => {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  const cells = z.array(cellSchema).safeParse(raw);
  if (!cells.success) {
    return null;
  }
  const table = cells.data;
  const read = (index: number, depth: number): Decoded => {
    const cell = table[index];
    if (index < 0 || depth > MAX_DEPTH || cell === undefined) {
      return null;
    }
    switch (cell.kind) {
      case "list": {
        return cell.refs.map((ref) => read(ref, depth + 1));
      }
      case "object": {
        const out: Record<string, Decoded> = {};
        for (const [key, ref] of Object.entries(cell.entries)) {
          const name = keyName(table[Number(key.slice(1))]);
          if (name !== null) {
            out[name] = read(ref, depth + 1);
          }
        }
        return out;
      }
      default: {
        return cell.value;
      }
    }
  };
  return read(0, 0);
};

const amountSchema = z.union([z.string(), z.number()]);

const quotaResponseSchema = z.object({
  [QUOTA_ROUTE]: z.object({
    data: z.object({
      creditStatus: z.object({
        credits: z.object({
          available: amountSchema,
          limit: amountSchema,
          used: amountSchema,
        }),
        creditsDecimals: z.number().int().min(0).max(18),
        periodEndsAt: z.string(),
      }),
    }),
  }),
});

export interface Credits {
  readonly creditsAvailable: number;
  readonly creditsLimit: number;
  readonly creditsUsed: number;
  readonly creditsResetAt: string;
}

export const fetchCredits = async (
  cookie: string,
  signal: AbortSignal | undefined
): Promise<Credits | null> => {
  let payload: string;
  try {
    const response = await fetch(`${config.origin}${QUOTA_PATH}`, {
      headers: {
        accept: "*/*",
        cookie,
        referer: `${config.origin}/chat`,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": config.userAgent,
      },
      redirect: "manual",
      signal,
    });
    if (!response.ok) {
      return null;
    }
    payload = await response.text();
  } catch {
    return null;
  }
  const decoded = quotaResponseSchema.safeParse(decodeTurboStream(payload));
  if (!decoded.success) {
    return null;
  }
  const { credits, creditsDecimals, periodEndsAt } =
    decoded.data[QUOTA_ROUTE].data.creditStatus;
  const scale = 10 ** creditsDecimals;
  return {
    creditsAvailable: Number(credits.available) / scale,
    creditsLimit: Number(credits.limit) / scale,
    creditsResetAt: periodEndsAt,
    creditsUsed: Number(credits.used) / scale,
  };
};
