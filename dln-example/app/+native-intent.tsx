/**
 * Expo Router calls redirectSystemPath with the launch URL before the first screen mounts.
 * The DeepLinkNow helper uses that moment for deferred deep linking:
 *
 * - First launch after install: it initializes the SDK, runs checkDeferredDeepLink (waiting
 *   at most timeoutMs) and returns the link the user tapped before installing, e.g.
 *   "/products/123?ref=newsletter". The app opens straight on that route.
 * - App opened by a link on one of your DeepLinkNow domains: returns its in-app path.
 * - Anything else: the path is returned unchanged.
 *
 * It never throws. A deferred link that arrives after the timeout is delivered by
 * useDeferredDeepLink() (see app/(tabs)/index.tsx).
 *
 * This example has no /products route, so mapLink sends every DeepLinkNow link to the home
 * screen with the link in ?dln=, and the screen shows it. In a real app, leave mapLink out
 * to route to the link's own path.
 */
import { createRedirectSystemPath } from "@deeplinknow/react-native/expo-router";

import { DLN_API_KEY, DLN_CONFIG } from "@/constants/deeplinknow";

export const redirectSystemPath = createRedirectSystemPath({
  apiKey: DLN_API_KEY,
  config: DLN_CONFIG,
  timeoutMs: 3000,
  mapLink: (link, source) =>
    `/?dln=${encodeURIComponent(link.fullPath)}&source=${source}`,
});
