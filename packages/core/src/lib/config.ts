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
  readonly logger?: UpstreamLogger;
}

export const DEFAULT_ORIGIN = "https://de.aipass.net";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

interface MutableConfig {
  logger?: UpstreamLogger;
  origin: string;
  userAgent: string;
}

export type ConfigChanges = Partial<MutableConfig>;

const current: MutableConfig = {
  origin: DEFAULT_ORIGIN,
  userAgent: DEFAULT_USER_AGENT,
};

export const config: Config = current;

/** Process-wide; the server calls it once at startup, a library consumer when the defaults are wrong. */
export const configure = (changes: ConfigChanges): void => {
  Object.assign(current, changes);
};
