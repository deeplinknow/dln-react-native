/**
 * The one deferred deep link check of this JS process, shared by the Expo Router helper
 * (`@deeplinknow/react-native/expo-router`, RN-26..RN-30) and `useDeferredDeepLink()` (RN-31).
 *
 * No React and no Expo Router imports: the SDK instance is passed in, so this module has no
 * import cycle with `index.ts` and works in any runtime.
 */
import type { DeepLinkNowConfig } from "./index";
import type {
  DeferredDeepLink,
  DeferredDeepLinkOptions,
  DLNAppInfo,
  ParsedDeepLink,
} from "./types";

/** The part of the `DeepLinkNow` singleton this module uses. */
export interface DeferredSessionSdk {
  checkDeferredDeepLink: (
    options?: DeferredDeepLinkOptions | null
  ) => Promise<DeferredDeepLink | null>;
  initialize: (
    apiKey: string,
    config?: DeepLinkNowConfig
  ) => Promise<DLNAppInfo | null>;
  isInitialized: () => boolean;
  parseDeepLink: (url: string) => ParsedDeepLink | null;
}

/** Options shared by the Expo Router helper and the hook. */
export interface DeferredSessionOptions {
  /**
   * Your DeepLinkNow API key. When the SDK is not initialized yet, the check initializes it
   * with this key (and `config`) first. Identical `initialize` calls made while that one is
   * in flight share it.
   */
  apiKey?: string;
  /** Passed to `initialize` together with `apiKey`. */
  config?: DeepLinkNowConfig;
  /** Discard fingerprint candidates below this score (0-100). Off by default (SDK-14). */
  minConfidence?: number;
  /** iOS only: read the pasteboard first (default true). Ignored on Android. */
  useClipboard?: boolean;
}

export type DeferredSessionStatus = "idle" | "pending" | "done";

export interface DeferredSessionState {
  /**
   * True once the link has been handled: the Expo Router helper routed to it, or the app
   * called `clear()`. A handled link is not handed out again in this process.
   */
  handled: boolean;
  /** The deferred deep link, once found. */
  link: DeferredDeepLink | null;
  status: DeferredSessionStatus;
}

const IDLE: DeferredSessionState = {
  status: "idle",
  link: null,
  handled: false,
};

let state: DeferredSessionState = IDLE;
let running: Promise<DeferredDeepLink | null> | null = null;
const listeners = new Set<() => void>();

function setState(next: DeferredSessionState) {
  state = next;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A listener must not break the others.
    }
  }
}

export function getDeferredSessionState(): DeferredSessionState {
  return state;
}

export function subscribeDeferredSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marks the current link as handled so neither the helper nor the hook hands it out again. */
export function markDeferredLinkHandled(): void {
  if (state.link && !state.handled) {
    setState({ ...state, handled: true });
  }
}

/** Initializes the SDK with `apiKey` unless it is already initialized. Never rejects. */
export async function ensureSdkInitialized(
  sdk: DeferredSessionSdk,
  options: DeferredSessionOptions
): Promise<void> {
  if (sdk.isInitialized() || !options.apiKey) {
    return;
  }
  // initialize never rejects (SDK-85); an identical in-flight call is shared (SDK-07).
  await sdk.initialize(options.apiKey, options.config);
}

/**
 * Starts the deferred deep link check once per JS process and returns its promise; later
 * calls get the same promise (or its settled result). Never rejects: a failure resolves
 * null and the error is in `DeepLinkNow.lastError` (SDK-85).
 */
export function startDeferredCheck(
  sdk: DeferredSessionSdk,
  options: DeferredSessionOptions
): Promise<DeferredDeepLink | null> {
  if (running) {
    return running;
  }
  setState({ status: "pending", link: null, handled: false });
  const checkOptions: DeferredDeepLinkOptions = {};
  if (options.minConfidence !== undefined) {
    checkOptions.minConfidence = options.minConfidence;
  }
  if (options.useClipboard !== undefined) {
    checkOptions.useClipboard = options.useClipboard;
  }
  running = (async () => {
    try {
      await ensureSdkInitialized(sdk, options);
      const link = await sdk.checkDeferredDeepLink(checkOptions);
      setState({ status: "done", link: link ?? null, handled: state.handled });
      return link ?? null;
    } catch {
      // checkDeferredDeepLink never rejects; this guards a custom or mocked SDK.
      setState({ status: "done", link: null, handled: state.handled });
      return null;
    }
  })();
  return running;
}

/**
 * Records that this process will not run the deferred check (the app was opened by a link,
 * which wins over a deferred match), so a later `useDeferredDeepLink()` doesn't start one.
 */
export function skipDeferredCheck(): void {
  if (running) {
    return;
  }
  running = Promise.resolve(null);
  setState({ status: "done", link: null, handled: false });
}
