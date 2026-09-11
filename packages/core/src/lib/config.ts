export interface WarningFields {
  readonly msg: string;
  readonly [detail: string]: string | number;
}

export interface UpstreamLogger {
  readonly warn: (fields: WarningFields) => void;
}

export interface Config {
  readonly origin: string;
  /** A browser's, because the edge refuses anything else. */
  readonly userAgent: string;
  /** Where the per-token prices come from, or null to report no cost. */
  readonly pricesUrl: string | null;
  readonly logger?: UpstreamLogger;
}

export const DEFAULT_ORIGIN = "https://de.aipass.net";

/** OpenRouter's public model list, which needs no key to read. */
export const DEFAULT_PRICES_URL = "https://openrouter.ai/api/v1/models";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

interface MutableConfig {
  logger?: UpstreamLogger;
  origin: string;
  pricesUrl: string | null;
  userAgent: string;
}

export type ConfigChanges = Partial<MutableConfig>;

const current: MutableConfig = {
  origin: DEFAULT_ORIGIN,
  pricesUrl: DEFAULT_PRICES_URL,
  userAgent: DEFAULT_USER_AGENT,
};

export const config: Config = current;

/** Process-wide; the server calls it once at startup, a library consumer when the defaults are wrong. */
export const configure = (changes: ConfigChanges): void => {
  Object.assign(current, changes);
};
