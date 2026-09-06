/** Where a warning goes when the proxy has no request to attach it to. */
export interface WarningFields {
  readonly msg: string;
  readonly [detail: string]: string | number;
}

export interface UpstreamLogger {
  readonly warn: (fields: WarningFields) => void;
}

export interface Config {
  /** The AI Pass origin every call goes to. */
  readonly origin: string;
  /** What the calls say they are; a browser, because that is what the edge expects. */
  readonly userAgent: string;
  readonly logger: UpstreamLogger;
}

export const DEFAULT_ORIGIN = "https://de.aipass.net";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

const silent: UpstreamLogger = {
  warn: () => {
    /* nothing listens until configure names a logger */
  },
};

interface MutableConfig {
  logger: UpstreamLogger;
  origin: string;
  userAgent: string;
}

/** The fields configure accepts; every one is optional. */
export type ConfigChanges = Partial<MutableConfig>;

const current: MutableConfig = {
  logger: silent,
  origin: DEFAULT_ORIGIN,
  userAgent: DEFAULT_USER_AGENT,
};

/** The live settings; reads see whatever configure set last. */
export const config: Config = current;

/**
 * Sets the origin, user agent or logger for the whole process. The server
 * calls it once at startup from its environment; a library consumer calls
 * it, or passes the same fields to createAipass, when the defaults are wrong.
 */
export const configure = (changes: ConfigChanges): void => {
  Object.assign(current, changes);
};
