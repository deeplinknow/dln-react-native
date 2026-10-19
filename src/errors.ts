/**
 * Typed errors shared by every DeepLinkNow SDK (SDK-55).
 */
export const DLN_ERROR_CODES = [
  "notInitialized",
  "invalidApiKey",
  "accountInactive",
  "noCredits",
  "rateLimited",
  "badRequest",
  "server",
  "network",
  "invalidResponse",
] as const;

export type DLNErrorCode = (typeof DLN_ERROR_CODES)[number];

export class DLNError extends Error {
  readonly code: DLNErrorCode;
  /** HTTP status, when the error came from a response. */
  readonly status?: number;
  /** The server's `error` / `message` string, when there was one. */
  readonly serverMessage?: string;
  readonly cause?: unknown;

  constructor(
    code: DLNErrorCode,
    message?: string,
    extra: { status?: number; serverMessage?: string; cause?: unknown } = {}
  ) {
    super(message ?? code);
    this.name = "DLNError";
    this.code = code;
    if (extra.status !== undefined) {
      this.status = extra.status;
    }
    if (extra.serverMessage !== undefined) {
      this.serverMessage = extra.serverMessage;
    }
    if (extra.cause !== undefined) {
      this.cause = extra.cause;
    }
    // Keep instanceof working when compiled to ES5.
    Object.setPrototypeOf(this, DLNError.prototype);
  }
}

const LEGACY_CODES: Record<string, DLNErrorCode> = {
  INIT_ERROR: "invalidResponse",
  MATCH_ERROR: "invalidResponse",
  REFERRER_ERROR: "invalidResponse",
  CLIPBOARD_ERROR: "invalidResponse",
};

export function isDLNErrorCode(code: unknown): code is DLNErrorCode {
  return (
    typeof code === "string" &&
    (DLN_ERROR_CODES as readonly string[]).includes(code)
  );
}

/**
 * What native modules reject with (Expo `CodedError`, React Native promise rejection).
 * Any field can be missing; each is checked before use.
 */
interface NativeRejection {
  code?: unknown;
  message?: string;
  status?: unknown;
  userInfo?: {
    cause?: unknown;
    causeCode?: unknown;
    causeMessage?: string;
    serverMessage?: unknown;
    status?: unknown;
  } | null;
}

/** Converts whatever a native module rejected with into a DLNError. */
export function toDLNError(e: unknown): DLNError {
  if (e instanceof DLNError) {
    return e;
  }
  const rejection = (e ?? {}) as NativeRejection;
  const rawCode: unknown = rejection.code;
  const code: DLNErrorCode = isDLNErrorCode(rawCode)
    ? rawCode
    : (typeof rawCode === "string" && LEGACY_CODES[rawCode]) ||
      "invalidResponse";
  const info = rejection.userInfo ?? {};
  // Expo modules can't attach userInfo, so the native glue appends "(HTTP nnn)".
  const httpInMessage = /\(HTTP (\d{3})\)/.exec(
    String(rejection.message ?? "")
  );
  const status =
    typeof info.status === "number"
      ? info.status
      : typeof rejection.status === "number"
        ? rejection.status
        : httpInMessage
          ? Number(httpInMessage[1])
          : undefined;
  const serverMessage =
    typeof info.serverMessage === "string" ? info.serverMessage : undefined;
  let cause: unknown;
  if (info.cause && typeof info.cause === "object") {
    cause = toDLNError(info.cause);
  } else if (typeof info.causeCode === "string") {
    cause = new DLNError(
      isDLNErrorCode(info.causeCode) ? info.causeCode : "invalidResponse",
      info.causeMessage
    );
  }
  return new DLNError(code, rejection.message ?? String(e), {
    status,
    serverMessage,
    cause,
  });
}

/** SDK-55 mapping of an HTTP status (+ server message) to an error code. */
export function codeForStatus(status: number, message?: string): DLNErrorCode {
  if (status === 401) {
    return "invalidApiKey";
  }
  if (status === 403) {
    return /credit/i.test(message ?? "") ? "noCredits" : "accountInactive";
  }
  if (status === 429) {
    return "rateLimited";
  }
  if (status >= 500) {
    return "server";
  }
  return "badRequest";
}
