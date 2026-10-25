/**
 * `useDeferredDeepLink()` (RN-31): the deferred deep link as React state, for apps without
 * Expo Router, and for Expo Router apps that navigate after sign-in instead of at launch.
 * The hook itself is exported from `index.ts`, bound to the `DeepLinkNow` singleton.
 *
 * Built on the link session (`link-session.ts`, SDK-89): the same deferred check, the same
 * "handled" bookkeeping and the same pending link as `DeepLinkNow.onLink` and
 * `useDeepLink()`. Its own `hold` / `onLink` keep their 1.3-era semantics (RN-33, RN-34):
 * deferred links only, `hold` per hook call, `onLink` at most once per process.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  type DeferredSessionOptions,
  type DeferredSessionSdk,
  getDeferredSessionState,
  markDeferredLinkHandled,
  startDeferredCheck,
  subscribeDeferredSession,
} from "./link-session";
import type { DeferredDeepLink } from "./types";

export interface UseDeferredDeepLinkOptions extends DeferredSessionOptions {
  /** Set to false to not start the check from this component (e.g. until consent). Default true. */
  enabled?: boolean;
  /**
   * Auth gate (RN-33). While true, a link that was found is held: `link` stays null,
   * `heldLink` has it, and `onLink` is not called. The check still runs, so the link is
   * resolved at launch (inside its claim window) and kept in memory for this process. When
   * `hold` turns false the link is delivered. Typically `hold: !isSignedIn`. Default false.
   * The hold applies to this hook call only: another component calling
   * `useDeferredDeepLink()` without `hold` still gets the link. Use one gated hook, usually
   * in the root layout.
   */
  hold?: boolean;
  /**
   * Called once per process with the link when it is available and not held (RN-34). The
   * link is marked handled (like `clear()`) before the call, so no other component, render
   * or the Expo Router helper delivers it again. An error it throws is caught and logged
   * with `console.warn` (SDK-85): the link stays handled, so route somewhere that is ready.
   */
  onLink?: (link: DeferredDeepLink) => void;
}

export interface UseDeferredDeepLinkResult {
  /** Marks the link as handled: `link` becomes null everywhere and stays null in this process. */
  clear: () => void;
  /**
   * The link while `hold` keeps it from `link` (e.g. to say "Sign in to open your invite"),
   * otherwise null. Null too once the link was handled.
   */
  heldLink: DeferredDeepLink | null;
  /** True until the check has finished. */
  isLoading: boolean;
  /**
   * The deferred deep link, or null: none found, not finished yet, held by this call's
   * `hold`, already handled with `clear()` or `onLink`, or already routed to by the Expo
   * Router helper. When you pass `onLink`, use it rather than `link` to navigate.
   */
  link: DeferredDeepLink | null;
}

export function useDeferredDeepLinkFor(
  sdk: DeferredSessionSdk,
  options: UseDeferredDeepLinkOptions = {}
): UseDeferredDeepLinkResult {
  const state = useSyncExternalStore(
    subscribeDeferredSession,
    getDeferredSessionState,
    getDeferredSessionState
  );
  const enabled = options.enabled !== false;
  // The latest options, read when the check starts, so an inline object doesn't restart it.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (enabled) {
      startDeferredCheck(sdk, optionsRef.current);
    }
  }, [enabled, sdk]);

  const hold = options.hold === true;
  const available = state.handled ? null : state.link;

  useEffect(() => {
    const { onLink } = optionsRef.current;
    if (!(available && onLink) || hold) {
      return;
    }
    // Read the shared state again: another component may have handled it in this commit.
    const current = getDeferredSessionState();
    if (current.handled || current.link !== available) {
      return;
    }
    markDeferredLinkHandled();
    try {
      onLink(available);
    } catch (error) {
      // The app's callback must not break rendering (SDK-85), but the link is gone for this
      // process, so say why.
      console.warn(
        "[DeepLinkNow] onLink threw; the deferred link was already marked handled:",
        error
      );
    }
  }, [available, hold]);

  return {
    link: hold ? null : available,
    heldLink: hold ? available : null,
    isLoading:
      state.status === "pending" || (enabled && state.status === "idle"),
    clear: markDeferredLinkHandled,
  };
}
