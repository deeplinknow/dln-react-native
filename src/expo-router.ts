/**
 * Expo Router integration: `@deeplinknow/react-native/expo-router` (RN-26..RN-30).
 *
 * Use it from `app/+native-intent.tsx`. Expo Router calls `redirectSystemPath` with the
 * launch URL before the first screen mounts, so on the first launch after install the
 * deferred deep link becomes the app's initial route, with no flash of the home screen and
 * no race with redirects in your layouts.
 *
 * ```tsx
 * // app/+native-intent.tsx
 * import { createRedirectSystemPath } from "@deeplinknow/react-native/expo-router";
 *
 * export const redirectSystemPath = createRedirectSystemPath({ apiKey: "YOUR_API_KEY" });
 * ```
 *
 * This module does not import `expo-router`; it only implements the function Expo Router
 * looks for.
 */
import {
  type DeferredSessionOptions,
  ensureSdkInitialized,
  getDeferredSessionState,
  markDeferredLinkHandled,
  skipDeferredCheck,
  startDeferredCheck,
} from "./deferred-session";
import DeepLinkNow from "./index";
import type { QueryParams } from "./types";

/** What Expo Router passes to `redirectSystemPath`. */
export interface NativeIntentEvent {
  /** True for the URL that launched the app (Expo Router's initial URL). */
  initial: boolean;
  /** The incoming URL or path. Not guaranteed to be a valid URL. */
  path: string;
}

/** The link a route is built from: a deferred deep link or a parsed Universal / App Link. */
export interface DeepLinkTarget {
  /** `/` + path + `?query`, exactly as on the link. */
  fullPath: string;
  path: string;
  queryParams: QueryParams;
  url: string;
}

export interface RedirectSystemPathOptions extends DeferredSessionOptions {
  /**
   * Your DeepLinkNow API key. The helper runs before any of your components, so it
   * initializes the SDK itself (once, and only when it is not initialized yet). You don't
   * need another `DeepLinkNow.initialize` call.
   */
  apiKey: string;
  /**
   * Turns a DeepLinkNow link into an Expo Router href. Default: the link's `fullPath`
   * (path and query exactly as tapped). Return null to keep the incoming path instead.
   */
  mapLink?: (
    link: DeepLinkTarget,
    source: "deferred" | "universal"
  ) => string | null | undefined;
  /**
   * Rewrite Universal Links / App Links on your DeepLinkNow domains (`alias.deeplinknow.com`
   * and verified custom domains) to their in-app path. Default true. Other URLs are never
   * changed.
   */
  mapUniversalLinks?: boolean;
  /**
   * Route to the deferred link at launch (default true). Set false when the link must wait
   * for sign-in (RN-33): the helper still starts the check at launch, but returns the
   * incoming path at once, without waiting, and leaves the link to
   * `useDeferredDeepLink({ hold: !isSignedIn, onLink })`. To hold only some links, return
   * null from `mapLink` for them instead: an unrouted link stays available to the hook.
   */
  routeDeferredLink?: boolean;
  /**
   * The longest the first launch waits for `initialize` + `checkDeferredDeepLink`, in
   * milliseconds. Default 3000. On timeout the app starts on the incoming path and the check
   * keeps running; a link found later is delivered by `useDeferredDeepLink()`. Use 0 to never
   * wait (the hook then delivers every deferred link).
   */
  timeoutMs?: number;
}

/** Default wait for the deferred deep link on the first launch (RN-28). */
export const DEFAULT_DEFERRED_TIMEOUT_MS = 3000;

const HTTP_URL = /^https?:\/\//i;
const SCHEME = /^([a-z][a-z0-9+.-]*):([\s\S]*)$/i;

/**
 * Whether Expo Router's initial path means "launched without a link": the app opened from
 * the home screen or the store. Expo Router passes its root URL then (`myapp:///`, or
 * `exp+myapp://host:8081/--/` in a development build). http(s) URLs are always links.
 */
export function isLaunchWithoutLink(path: string): boolean {
  let rest = path.trim();
  if (!rest) {
    return true;
  }
  const scheme = SCHEME.exec(rest);
  if (scheme) {
    const [, name, afterScheme] = scheme;
    if (/^https?$/i.test(name)) {
      return false;
    }
    rest = afterScheme;
    const expoPath = rest.indexOf("/--/");
    if (expoPath !== -1) {
      rest = rest.slice(expoPath + 4);
    }
  }
  rest = rest.replace(/#[\s\S]*$/, "").replace(/^\/+/, "");
  return rest === "" || rest === "?";
}

function resolveTimeout(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_DEFERRED_TIMEOUT_MS;
  }
  return Math.max(0, value);
}

/** Resolves `{ done: true, value }`, or `{ done: false }` after `ms`. Never rejects. */
async function within<T>(
  promise: Promise<T>,
  ms: number
): Promise<{ done: true; value: T } | { done: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ done: false }>((resolve) => {
    timer = setTimeout(() => resolve({ done: false }), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        (value) => ({ done: true as const, value }),
        () => ({ done: false as const })
      ),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function targetPath(
  link: DeepLinkTarget,
  source: "deferred" | "universal",
  options: RedirectSystemPathOptions
): string | null {
  if (!options.mapLink) {
    return link.fullPath || null;
  }
  const mapped = options.mapLink(link, source);
  if (mapped === undefined) {
    return link.fullPath || null;
  }
  return typeof mapped === "string" && mapped ? mapped : null;
}

/** The in-app path for a Universal / App Link on the app's DLN domains, or null. */
function universalLinkPath(
  path: string,
  options: RedirectSystemPathOptions
): string | null {
  if (options.mapUniversalLinks === false || !HTTP_URL.test(path)) {
    return null;
  }
  const parsed = DeepLinkNow.parseDeepLink(path);
  return parsed ? targetPath(parsed, "universal", options) : null;
}

/** The event's path; "/" when Expo Router (or a caller) passes something unexpected. */
function incomingPath(event: unknown): string {
  const path = (event as Partial<NativeIntentEvent> | null | undefined)?.path;
  return typeof path === "string" ? path : "/";
}

/**
 * Expo Router `redirectSystemPath` with DeepLinkNow deferred deep linking.
 *
 * - First launch without a link (`initial` and Expo Router's root URL): initializes the SDK,
 *   runs `checkDeferredDeepLink` (honouring `minConfidence` / `useClipboard`) for at most
 *   `timeoutMs`, and returns the deferred link's path. The native SDK runs the chain once
 *   per install, so later launches get null quickly and keep the incoming path.
 * - App opened by a DeepLinkNow Universal / App Link: returns the link's in-app path. The
 *   deferred chain is not run, because the tapped link wins.
 * - Any other URL: returned unchanged.
 *
 * Never throws or rejects: on any failure or timeout it returns the incoming path.
 */
export async function redirectSystemPathWithDeferredLink(
  event: NativeIntentEvent,
  options: RedirectSystemPathOptions
): Promise<string> {
  const incoming = incomingPath(event);
  try {
    const timeoutMs = resolveTimeout(options.timeoutMs);
    if (!event.initial) {
      return universalLinkPath(incoming, options) ?? incoming;
    }

    if (!isLaunchWithoutLink(incoming)) {
      skipDeferredCheck();
      if (options.mapUniversalLinks === false || !HTTP_URL.test(incoming)) {
        return incoming;
      }
      // The link's domains come from init; wait for it, but never longer than timeoutMs.
      await within(ensureSdkInitialized(DeepLinkNow, options), timeoutMs);
      return universalLinkPath(incoming, options) ?? incoming;
    }

    if (options.routeDeferredLink === false) {
      // Auth gate (RN-33): resolve the link now, deliver it later through the hook.
      startDeferredCheck(DeepLinkNow, options).catch(() => null);
      return incoming;
    }

    const result = await within(
      startDeferredCheck(DeepLinkNow, options),
      timeoutMs
    );
    if (!(result.done && result.value)) {
      return incoming;
    }
    if (getDeferredSessionState().handled) {
      // Already routed in this process (e.g. a reload in development).
      return incoming;
    }
    const target = targetPath(result.value, "deferred", options);
    if (!target) {
      return incoming;
    }
    markDeferredLinkHandled();
    return target;
  } catch {
    return incoming;
  }
}

/**
 * Returns a `redirectSystemPath` for `app/+native-intent.tsx`:
 *
 * ```tsx
 * export const redirectSystemPath = createRedirectSystemPath({ apiKey: "YOUR_API_KEY" });
 * ```
 */
export function createRedirectSystemPath(
  options: RedirectSystemPathOptions
): (event: NativeIntentEvent) => Promise<string> {
  return (event) => redirectSystemPathWithDeferredLink(event, options);
}
