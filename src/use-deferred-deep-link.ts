/**
 * `useDeferredDeepLink()` (RN-31): the deferred deep link as React state, for apps without
 * Expo Router, and for Expo Router apps that navigate after sign-in instead of at launch.
 * The hook itself is exported from `index.ts`, bound to the `DeepLinkNow` singleton.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  type DeferredSessionOptions,
  type DeferredSessionSdk,
  getDeferredSessionState,
  markDeferredLinkHandled,
  startDeferredCheck,
  subscribeDeferredSession,
} from "./deferred-session";
import type { DeferredDeepLink } from "./types";

export interface UseDeferredDeepLinkOptions extends DeferredSessionOptions {
  /** Set to false to not start the check from this component (e.g. until consent). Default true. */
  enabled?: boolean;
}

export interface UseDeferredDeepLinkResult {
  /** Marks the link as handled: `link` becomes null everywhere and stays null in this process. */
  clear: () => void;
  /** True until the check has finished. */
  isLoading: boolean;
  /**
   * The deferred deep link, or null: none found, not finished yet, already handled with
   * `clear()`, or already routed to by the Expo Router helper.
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

  return {
    link: state.handled ? null : state.link,
    isLoading:
      state.status === "pending" || (enabled && state.status === "idle"),
    clear: markDeferredLinkHandled,
  };
}
