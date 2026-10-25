/**
 * The link session of this JS process: one place that knows every link the app was handed.
 *
 * - The one deferred deep link check (SDK-27), shared by `DeepLinkNow.onLink` /
 *   `useDeepLink()` (SDK-86), `useDeferredDeepLink()` (RN-31, RN-33, RN-34) and the Expo
 *   Router helper (RN-26..RN-30, RN-35).
 * - Direct opens read from React Native's `Linking` (the initial URL and `url` events,
 *   SDK-87), deduplicated (SDK-88) and optionally resolved (SDK-90).
 * - Delivery to `onLink` handlers, replay to a late handler, and the hold
 *   (`pendingLink`, `releasePendingLink()`, `clearPendingLink()`, SDK-89).
 *
 * No React and no Expo Router imports: the SDK instance is passed in, so this module has no
 * import cycle with `index.ts` and works in any runtime.
 */
import { Linking, Platform } from "react-native";

import { parseSchemeLink, stripDlnFragment } from "./deeplink";
import type { DeepLinkNowConfig } from "./index";
import type {
  DeferredDeepLink,
  DeferredDeepLinkOptions,
  DLNAppInfo,
  DLNLink,
  DLNLinkSource,
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
  /** SDK-90. Used for direct opens when `resolve: true`. */
  resolveLink?: (url: string) => Promise<DLNLink | null>;
  /** Resolves once no `initialize` is in flight. Never rejects. */
  waitForInitialization?: () => Promise<void>;
}

/** Options shared by the Expo Router helper and the hooks. */
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

/** Options of `DeepLinkNow.onLink(handler, options)` (SDK-86..SDK-90). */
export interface OnLinkOptions extends DeferredSessionOptions {
  /**
   * Hold links until the app is ready (SDK-89), e.g. `hold: !isSignedIn`. While held, a link
   * is kept in `DeepLinkNow.pendingLink` instead of calling this handler, until
   * `releasePendingLink()` delivers it or `clearPendingLink()` drops it. Default false.
   */
  hold?: boolean;
  /**
   * Resolve direct opens on the app's DLN domains through `GET /api/v1/sdk/resolve`
   * (SDK-90), filling `deeplinkId`, `targetUrl`, `campaignId` and `metadata`. Adds one request
   * per open, bounded by the configured `timeoutMs`; a 404, a timeout or an error delivers the
   * link unresolved. Default false.
   */
  resolve?: boolean;
  /**
   * Your app's custom URL schemes, e.g. `["myapp"]` (SDK-87). A scheme URL is delivered
   * only when its scheme is listed here (every registration's list counts), or, when no
   * list was given, when it is the `scheme` in your Expo config (`expo-constants`). Bare
   * React Native apps without a list get no scheme links. System schemes (`http`, `mailto`,
   * `tel`, …) never count.
   */
  schemes?: string[];
}

export type DeferredSessionStatus = "idle" | "pending" | "done";

export interface DeferredSessionState {
  /**
   * True once the link has been handled: the Expo Router helper routed to it, an `onLink`
   * handler got it, or the app called `clear()`. A handled link is not handed out again in
   * this process.
   */
  handled: boolean;
  /** The deferred deep link, once found. */
  link: DeferredDeepLink | null;
  status: DeferredSessionStatus;
}

export interface LinkSessionState {
  /** The deferred check's status. */
  deferredStatus: DeferredSessionStatus;
  /** True while the deferred check or the launch URL is being worked out. */
  isLoading: boolean;
  /** The first of `pendingLinks`, or null. */
  pendingLink: DLNLink | null;
  /**
   * Links not delivered yet, held (SDK-89) or waiting for a handler (SDK-86): the latest of
   * each kind, deferred first. A new array only when it changes.
   */
  pendingLinks: readonly DLNLink[];
}

export interface LinkSubscription {
  /** Changes this handler's hold; turning it off delivers what is pending. */
  setHold: (hold: boolean) => void;
  unsubscribe: () => void;
}

/**
 * How long the same URL counts as the same open (SDK-88): the initial URL vs a `url` event,
 * a URL the Expo Router helper handled, or the same URL sent twice.
 */
export const DIRECT_DEDUPE_WINDOW_MS = 3000;

interface Entry {
  handled: boolean;
  link: DLNLink;
  /** The `DeferredDeepLink` as `checkDeferredDeepLink` returned it (deferred entries only). */
  original: DeferredDeepLink | null;
  seq: number;
}

interface Subscriber {
  handler: (link: DLNLink) => void;
  hold: boolean;
}

type Channel = "initial" | "event" | "router";

let seq = 0;
let deferredStatus: DeferredSessionStatus = "idle";
let deferredEntry: Entry | null = null;
let running: Promise<DeferredDeepLink | null> | null = null;
/** Undelivered links, oldest kind first: at most one deferred and the latest direct one. */
let queue: Entry[] = [];
const subscribers = new Set<Subscriber>();
const listeners = new Set<() => void>();
let directStarted = false;
let directInFlight = 0;
let recentDirect: { at: number; channel: Channel; url: string }[] = [];
let routerInitialUrl: string | null = null;

let deferredState: DeferredSessionState = {
  status: "idle",
  link: null,
  handled: false,
};
let linkState: LinkSessionState = {
  deferredStatus: "idle",
  isLoading: false,
  pendingLink: null,
  pendingLinks: [],
};

function samePending(a: readonly DLNLink[], b: readonly DLNLink[]): boolean {
  return a.length === b.length && a.every((link, i) => link === b[i]);
}

/** Rebuilds the snapshots (new objects only when something changed) and notifies. */
function changed() {
  const link = deferredEntry?.original ?? null;
  const handled = deferredEntry?.handled ?? false;
  if (
    deferredState.status !== deferredStatus ||
    deferredState.link !== link ||
    deferredState.handled !== handled
  ) {
    deferredState = { status: deferredStatus, link, handled };
  }
  // The queue is kept deferred first (enqueue), so pendingLinks is too.
  const queued = queue.map((entry) => entry.link);
  const pendingLinks = samePending(linkState.pendingLinks, queued)
    ? linkState.pendingLinks
    : Object.freeze(queued);
  const isLoading = deferredStatus === "pending" || directInFlight > 0;
  if (
    linkState.deferredStatus !== deferredStatus ||
    linkState.isLoading !== isLoading ||
    linkState.pendingLinks !== pendingLinks
  ) {
    linkState = {
      deferredStatus,
      isLoading,
      pendingLink: pendingLinks[0] ?? null,
      pendingLinks,
    };
  }
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A listener must not break the others.
    }
  }
}

function markHandled(entry: Entry) {
  entry.handled = true;
  queue = queue.filter((e) => e !== entry);
}

function enqueue(entry: Entry) {
  if (entry.link.type === "direct") {
    // Only the latest direct open is kept (SDK-89).
    for (const e of queue) {
      if (e.link.type === "direct") {
        markHandled(e);
      }
    }
  }
  queue = [...queue, entry].sort((a, b) =>
    a.link.type === b.link.type
      ? a.seq - b.seq
      : a.link.type === "deferred"
        ? -1
        : 1
  );
}

function callHandler(handler: (link: DLNLink) => void, link: DLNLink) {
  try {
    handler(link);
  } catch (error) {
    // The app's handler must not break the SDK (SDK-85), but the link is gone for this
    // process, so say why.
    console.warn(
      "[DeepLinkNow] onLink threw; the link was already marked delivered:",
      error
    );
  }
}

/** Marks `entries` delivered, then hands each to every receiver, deferred first (SDK-88). */
function deliver(entries: Entry[], receivers: Subscriber[]) {
  for (const entry of entries) {
    markHandled(entry);
  }
  changed();
  for (const entry of entries) {
    for (const receiver of receivers) {
      callHandler(receiver.handler, entry.link);
    }
  }
}

/** Delivers everything pending to the handlers that don't hold. */
function dispatch() {
  if (queue.length === 0) {
    return;
  }
  const receivers = [...subscribers].filter((s) => !s.hold);
  if (receivers.length === 0) {
    return;
  }
  deliver(queue.slice(), receivers);
}

function dispatchSoon() {
  // A microtask, so a handler never runs before `onLink` has returned its unsubscribe.
  Promise.resolve()
    .then(dispatch)
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// State for React (useSyncExternalStore)
// ---------------------------------------------------------------------------

export function getDeferredSessionState(): DeferredSessionState {
  return deferredState;
}

export function getLinkSessionState(): LinkSessionState {
  return linkState;
}

export function subscribeDeferredSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Same store as `subscribeDeferredSession`: one notification for every change. */
export const subscribeLinkSession = subscribeDeferredSession;

// ---------------------------------------------------------------------------
// Hold (SDK-89)
// ---------------------------------------------------------------------------

/** The first pending link (deferred first), or null (SDK-89). */
export function getPendingLink(): DLNLink | null {
  return linkState.pendingLink;
}

/** Every pending link, deferred first: at most one deferred and one direct (SDK-89). */
export function getPendingLinks(): readonly DLNLink[] {
  return linkState.pendingLinks;
}

/**
 * Delivers the pending link(s) to every registered handler and ends the hold of every
 * handler, so later links go straight to them (SDK-89). Returns false when there is nothing
 * pending or no handler to deliver to (the link then stays pending).
 */
export function releasePendingLink(): boolean {
  // SDK-89: releasing ends the hold, so later links go straight to the handlers.
  for (const subscriber of subscribers) {
    subscriber.hold = false;
  }
  if (queue.length === 0 || subscribers.size === 0) {
    return false;
  }
  deliver(queue.slice(), [...subscribers]);
  return true;
}

/** Drops the pending link(s): they are never delivered in this process. The hold stays on. */
export function clearPendingLink(): void {
  if (queue.length === 0) {
    return;
  }
  for (const entry of queue.slice()) {
    markHandled(entry);
  }
  changed();
}

/** Marks the deferred link as handled so nothing hands it out again in this process. */
export function markDeferredLinkHandled(): void {
  if (deferredEntry && !deferredEntry.handled) {
    markHandled(deferredEntry);
    changed();
  }
}

/** The deferred link while it is still available (found and not handled), else null. */
export function availableDeferredEntry(): DeferredDeepLink | null {
  return deferredEntry && !deferredEntry.handled
    ? deferredEntry.original
    : null;
}

// ---------------------------------------------------------------------------
// Deferred check (SDK-27, RN-31)
// ---------------------------------------------------------------------------

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

function toDeferredLink(link: DeferredDeepLink): DLNLink {
  return { ...link, type: "deferred" };
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
  deferredStatus = "pending";
  changed();
  const checkOptions: DeferredDeepLinkOptions = {};
  if (options.minConfidence !== undefined) {
    checkOptions.minConfidence = options.minConfidence;
  }
  if (options.useClipboard !== undefined) {
    checkOptions.useClipboard = options.useClipboard;
  }
  running = (async () => {
    let link: DeferredDeepLink | null = null;
    try {
      await ensureSdkInitialized(sdk, options);
      link = (await sdk.checkDeferredDeepLink(checkOptions)) ?? null;
    } catch {
      // checkDeferredDeepLink never rejects; this guards a custom or mocked SDK.
      link = null;
    }
    if (link) {
      seq += 1;
      deferredEntry = {
        link: toDeferredLink(link),
        original: link,
        handled: false,
        seq,
      };
      enqueue(deferredEntry);
    }
    deferredStatus = "done";
    changed();
    dispatch();
    return link;
  })();
  return running;
}

/**
 * Records that this process will not run the deferred check (the app was opened by a link,
 * which wins over a deferred match in the Expo Router helper), so a later hook doesn't start
 * one.
 */
export function skipDeferredCheck(): void {
  if (running) {
    return;
  }
  running = Promise.resolve(null);
  deferredStatus = "done";
  changed();
}

// ---------------------------------------------------------------------------
// Direct opens (SDK-87, SDK-88, SDK-90)
// ---------------------------------------------------------------------------

function directSource(): DLNLinkSource {
  return Platform.OS === "android" ? "appLink" : "universalLink";
}

function toDirectLink(parsed: ParsedDeepLink, source: DLNLinkSource): DLNLink {
  return {
    type: "direct",
    source,
    path: parsed.path,
    queryParams: parsed.queryParams,
    fullPath: stripDlnFragment(parsed.fullPath),
    url: stripDlnFragment(parsed.url),
    confidenceScore: 100,
    matchQuality: "HIGH",
  };
}

const HTTP_URL = /^https?:\/\//i;
const SCHEME_NAME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/** Schemes that are never an app's own (SDK-87), even when listed in `schemes`. */
const SYSTEM_SCHEMES = new Set([
  "http",
  "https",
  "mailto",
  "tel",
  "sms",
  "content",
  "file",
  "intent",
  "itms-apps",
  "itms-appss",
  "market",
  "data",
  "javascript",
  "about",
  "blob",
  "ftp",
  "ws",
  "wss",
]);

const listedSchemes = new Set<string>();
let expoSchemes: Set<string> | null = null;

/** Adds the schemes an `onLink` registration lists (SDK-87). */
export function addAppSchemes(schemes: unknown): void {
  if (!Array.isArray(schemes)) {
    return;
  }
  for (const scheme of schemes) {
    if (typeof scheme === "string" && scheme.trim()) {
      listedSchemes.add(scheme.trim().toLowerCase());
    }
  }
}

/** The `scheme` of the Expo config, read once from `expo-constants` when it is installed. */
function expoConfigSchemes(): Set<string> {
  if (expoSchemes) {
    return expoSchemes;
  }
  expoSchemes = new Set();
  try {
    // Dynamic require so bare React Native apps don't need expo-constants.
    const mod = require("expo-constants");
    const constants = mod?.default ?? mod;
    const scheme: unknown =
      constants?.expoConfig?.scheme ?? constants?.manifest?.scheme;
    for (const s of Array.isArray(scheme) ? scheme : [scheme]) {
      if (typeof s === "string" && s) {
        expoSchemes.add(s.toLowerCase());
      }
    }
  } catch {
    // Not an Expo app: only `schemes` counts.
  }
  return expoSchemes;
}

/**
 * SDK-87: a scheme is the app's when listed in `schemes`, or, with no list, when it is the
 * Expo config's scheme. Expo Go / dev-client URLs (`exp`, `exps`, `exp+…`, which the parser
 * accepts only with a `/--/` path) are the running app's. System schemes never count.
 */
function isAppScheme(scheme: string): boolean {
  if (SYSTEM_SCHEMES.has(scheme)) {
    return false;
  }
  if (scheme === "exp" || scheme === "exps" || scheme.startsWith("exp+")) {
    return true;
  }
  const known = listedSchemes.size ? listedSchemes : expoConfigSchemes();
  return known.has(scheme);
}

/**
 * The unresolved `DLNLink` for a URL the OS opened the app with: an https link on the app's
 * DLN domains (`parseDeepLink`'s host rule), or a URL on the app's scheme. Null otherwise.
 */
export function directLinkFromUrl(
  sdk: Pick<DeferredSessionSdk, "parseDeepLink">,
  url: unknown
): DLNLink | null {
  if (typeof url !== "string") {
    return null;
  }
  const trimmed = url.trim();
  if (HTTP_URL.test(trimmed)) {
    const parsed = sdk.parseDeepLink(trimmed);
    return parsed ? toDirectLink(parsed, directSource()) : null;
  }
  const name = SCHEME_NAME.exec(trimmed)?.[1]?.toLowerCase();
  if (!(name && isAppScheme(name))) {
    return null;
  }
  const scheme = parseSchemeLink(trimmed);
  return scheme ? toDirectLink(scheme, "scheme") : null;
}

/** SDK-88: the same URL again within 3 seconds, from any channel, is the same open. */
function isReplay(url: string, channel: Channel, now: number): boolean {
  if (channel === "initial" && routerInitialUrl === url) {
    return true;
  }
  return recentDirect.some(
    (r) => r.url === url && now - r.at <= DIRECT_DEDUPE_WINDOW_MS
  );
}

function remember(url: string, channel: Channel, now: number) {
  recentDirect = recentDirect
    .filter((r) => now - r.at <= DIRECT_DEDUPE_WINDOW_MS)
    .concat({ url, channel, at: now });
}

/**
 * The Expo Router helper calls this for every URL it handles: Expo Router navigates to it,
 * so the link session must not deliver the same open again (SDK-88).
 */
export function claimDirectOpen(url: string, initial: boolean): void {
  if (typeof url !== "string" || !url) {
    return;
  }
  if (initial) {
    routerInitialUrl = url;
  }
  remember(url, "router", Date.now());
}

async function buildDirectLink(
  sdk: DeferredSessionSdk,
  options: OnLinkOptions,
  url: string
): Promise<DLNLink | null> {
  if (HTTP_URL.test(url.trim())) {
    // The app's domains come from init: wait for it before applying the host rule.
    await ensureSdkInitialized(sdk, options);
    await sdk.waitForInitialization?.();
    if (options.resolve && sdk.resolveLink) {
      return sdk.resolveLink(url);
    }
  }
  return directLinkFromUrl(sdk, url);
}

async function onDirectUrl(
  sdk: DeferredSessionSdk,
  options: OnLinkOptions,
  url: unknown,
  channel: Channel
): Promise<void> {
  if (typeof url !== "string" || !url) {
    return;
  }
  const now = Date.now();
  if (isReplay(url, channel, now)) {
    return;
  }
  remember(url, channel, now);
  let link: DLNLink | null = null;
  try {
    link = await buildDirectLink(sdk, options, url);
  } catch {
    link = null;
  }
  if (!link) {
    return;
  }
  seq += 1;
  enqueue({ link, original: null, handled: false, seq });
  changed();
  dispatch();
}

interface LinkingLike {
  addEventListener?: (
    type: "url",
    handler: (event: { url?: unknown }) => void
  ) => unknown;
  getInitialURL?: () => Promise<string | null>;
}

/** Starts reading the initial URL and `url` events, once per process (SDK-87). */
function startDirectOpens(sdk: DeferredSessionSdk, options: OnLinkOptions) {
  if (directStarted) {
    return;
  }
  directStarted = true;
  const linking = Linking as LinkingLike | undefined;
  if (!linking) {
    return;
  }
  try {
    linking.addEventListener?.("url", (event) => {
      onDirectUrl(sdk, options, event?.url, "event").catch(() => undefined);
    });
  } catch {
    // No Linking events in this runtime.
  }
  if (typeof linking.getInitialURL !== "function") {
    return;
  }
  directInFlight += 1;
  changed();
  const done = () => {
    directInFlight -= 1;
    changed();
  };
  (async () => {
    let url: string | null = null;
    try {
      url = (await linking.getInitialURL?.()) ?? null;
    } catch {
      url = null;
    }
    await onDirectUrl(sdk, options, url, "initial");
  })().then(done, done);
}

// ---------------------------------------------------------------------------
// onLink (SDK-86)
// ---------------------------------------------------------------------------

/**
 * Registers a handler for every link (SDK-86): starts the shared deferred check and the
 * direct-open listener (once per process each), and replays what is pending.
 */
export function subscribeLinks(
  sdk: DeferredSessionSdk,
  handler: (link: DLNLink) => void,
  options: OnLinkOptions = {}
): LinkSubscription {
  const subscriber: Subscriber = { handler, hold: options.hold === true };
  subscribers.add(subscriber);
  addAppSchemes(options.schemes);
  startDeferredCheck(sdk, options).catch(() => null);
  startDirectOpens(sdk, options);
  dispatchSoon();
  return {
    setHold(hold: boolean) {
      if (subscriber.hold === hold) {
        return;
      }
      subscriber.hold = hold;
      if (!hold) {
        dispatchSoon();
      }
    },
    unsubscribe() {
      subscribers.delete(subscriber);
    },
  };
}
