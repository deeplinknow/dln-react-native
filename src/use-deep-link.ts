/**
 * `useDeepLink()` (SDK-89): every link, deferred or direct, as React state over
 * `DeepLinkNow.onLink`. The hook itself is exported from `index.ts`, bound to the
 * `DeepLinkNow` singleton.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  clearPendingLink,
  type DeferredSessionSdk,
  getLinkSessionState,
  type LinkSubscription,
  type OnLinkOptions,
  releasePendingLink,
  subscribeLinkSession,
  subscribeLinks,
} from "./link-session";
import type { DLNLink } from "./types";

export interface UseDeepLinkOptions extends OnLinkOptions {
  /** Set to false to not register (no check, no listener) from this component. Default true. */
  enabled?: boolean;
  /**
   * Hold links until the app is ready, typically `hold: !isSignedIn` (SDK-89). While true,
   * a new link waits in `pendingLink` and `link` doesn't change. When it turns false, the
   * pending link is delivered to `link`. Default false.
   */
  hold?: boolean;
}

export interface UseDeepLinkResult {
  /** Drops the pending link (`clearPendingLink()`, the hold stays on) and sets `link` back to null. */
  clear: () => void;
  /** True while the first-launch deferred check or the launch URL is being worked out. */
  isLoading: boolean;
  /**
   * The latest link delivered to this hook (a new object for every open), or null. Navigate
   * when it changes: `useEffect(() => { if (link) router.push(link.fullPath); }, [link])`.
   */
  link: DLNLink | null;
  /** The link waiting while `hold` is true (e.g. for "Sign in to open your invite"), or null. */
  pendingLink: DLNLink | null;
  /** Every link waiting while `hold` is true, deferred first (`pendingLink` is the first). */
  pendingLinks: readonly DLNLink[];
  /**
   * `releasePendingLink()`: delivers the pending link now and ends the hold, so later links
   * arrive in `link` at once even while the `hold` option is still true (until `hold`
   * changes again).
   */
  release: () => void;
}

export function useDeepLinkFor(
  sdk: DeferredSessionSdk,
  options: UseDeepLinkOptions = {}
): UseDeepLinkResult {
  const session = useSyncExternalStore(
    subscribeLinkSession,
    getLinkSessionState,
    getLinkSessionState
  );
  const [link, setLink] = useState<DLNLink | null>(null);
  const enabled = options.enabled !== false;
  const hold = options.hold === true;
  // The latest options, read when the subscription starts, so an inline object doesn't
  // restart it.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const subscription = useRef<LinkSubscription | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const sub = subscribeLinks(sdk, setLink, {
      ...optionsRef.current,
      hold: holdRef.current,
    });
    subscription.current = sub;
    return () => {
      sub.unsubscribe();
      if (subscription.current === sub) {
        subscription.current = null;
      }
    };
  }, [enabled, sdk]);

  useEffect(() => {
    subscription.current?.setHold(hold);
  }, [hold]);

  return {
    link,
    pendingLink: session.pendingLink,
    pendingLinks: session.pendingLinks,
    isLoading:
      session.isLoading || (enabled && session.deferredStatus === "idle"),
    release: () => {
      releasePendingLink();
    },
    clear: () => {
      clearPendingLink();
      setLink(null);
    },
  };
}
