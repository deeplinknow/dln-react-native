# Changelog

All notable changes to `@deeplinknow/react-native`. iOS, Android and React Native share one major.minor version (SDK-84).

## 1.4.0

Not released yet. Ships as 1.4.0 with iOS and Android 1.4.0 (SDK-84); the version is not bumped yet. The React Native changes below are JavaScript only.

### Features

- **One link object for every open** (SDK-86 to SDK-91, RN-36 to RN-41). `DeepLinkNow.onLink(handler, options)` delivers a `DLNLink` for the first-launch deferred link (`type: "deferred"`) and for every direct open (`type: "direct"`, `source` `"universalLink"`, `"appLink"` or `"scheme"`), and returns an unsubscribe function. The SDK reads `Linking.getInitialURL()` and `url` events itself. Custom-scheme links count when the scheme is listed in `schemes` (default: the Expo config's `scheme`). A link that arrived before the handler was registered is replayed once; the same URL again within 3 seconds (a cold-start URL that the OS also sends as a `url` event, or a link the Expo Router helper already routed) is delivered once. The deferred check is the same single check as `checkDeferredDeepLink()` and `useDeferredDeepLink()`: concurrent calls share it.
- **Hold until the app is ready** (SDK-89, RN-39): `onLink(handler, { hold: true })` keeps the latest link of each kind in `DeepLinkNow.pendingLinks` (read-only, deferred first; `pendingLink` is the first) until `releasePendingLink()` delivers them (deferred first) and ends the hold, or `clearPendingLink()` drops them and keeps holding.
- **`useDeepLink(options?)`** returns `{ link, pendingLink, pendingLinks, isLoading, release, clear }` over `onLink`; `hold: !isSignedIn` delivers the pending link when the user signs in.
- **Resolving direct opens** (SDK-90, RN-41): opt-in `resolve: true`, and `DeepLinkNow.resolveLink(url)`, call `GET /api/v1/sdk/resolve` to fill `deeplinkId`, `targetUrl`, `campaignId` and `metadata` (for links imported from Firebase Dynamic Links). Bounded by `timeoutMs`; a 404, a timeout or an error delivers the link unresolved.
- **The `dln` fragment is stripped** (SDK-92, RN-42): `parseDeepLink`, `checkDeferredDeepLink` and `onLink` never include a `#dln=<click id>` fragment parameter in `url` or `fullPath`.
- **Clipboard links are claimed on iOS** (SDK-93): this arrives with DeepLinkNow iOS SDK 1.4.0, which React Native 1.4.0 will pin. A pasteboard link carrying `#dln=<click id>` is claimed on the server first, so a stale or already-claimed link is skipped instead of delivered as an exact match. No React Native code change.

- **Hold the deferred link until sign-in** (RN-33 to RN-35). `useDeferredDeepLink({ hold: !isSignedIn, onLink })` keeps a found link in memory while `hold` is true (`link` is `null`, the new `heldLink` has it) and calls `onLink(link)` exactly once when `hold` turns false. The link is marked handled before `onLink` runs, so re-renders, other `onLink` callbacks and the Expo Router helper never open it twice. `clear()` drops a held link. `hold` applies to the hook call that passes it. If `onLink` throws, the SDK logs a `console.warn` (the link stays handled).
- **`routeDeferredLink: false`** for `createRedirectSystemPath` / `redirectSystemPathWithDeferredLink`: the helper starts the deferred check at launch but doesn't wait for it or route to it, and leaves the link to the hook. A deferred link that `mapLink` maps to `null` also stays available to the hook (documented and tested).

### Other changes

- `useDeferredDeepLink()`, its `hold` / `onLink` / `heldLink`, and the Expo Router helper now run on the same link session as `onLink`. Their behaviour is unchanged.
- README and Expo Router docs: "After sign-in" replaces the `timeoutMs: 0` advice, with a `useDeepLink()` variant.
- Additive only: without the new calls and options, behaviour is the same as 1.3.0.

## 1.3.0 (2026-10-21)

### Features

- **Expo Router helper**, a new subpath `@deeplinknow/react-native/expo-router` (RN-26 to RN-30). `createRedirectSystemPath({ apiKey })` is Expo Router's `redirectSystemPath` for `app/+native-intent.tsx`: on the first launch after install it initializes the SDK, runs `checkDeferredDeepLink()` and starts the app on the link the user tapped. It waits at most `timeoutMs` (default 3000 ms; `0` never waits) and never throws. Links on your DeepLinkNow domains are rewritten to their in-app path on any launch (`mapUniversalLinks`, default on). `mapLink`, `minConfidence` and `useClipboard` are passed through. `redirectSystemPathWithDeferredLink(event, options)` is there for apps that add their own rewrites. The subpath doesn't import `expo-router` or React.
- **`useDeferredDeepLink(options?)`**, exported from the main entry (RN-31). It returns `{ link, isLoading, clear }`, shares one deferred check per JS process with the Expo Router helper, and delivers a link found after the helper's timeout or one you want to open only after sign-in.
- The example app uses the helper in `app/+native-intent.tsx` and the hook for late links (RN-32).

### Other changes

- Pins the native SDKs at **DeepLinkNow `~> 1.3.0`** (CocoaPods) and **`com.deeplinknow:dln-android:1.3.0`** (Maven Central), the 1.3.0 re-sync of all three SDKs. The native SDKs have no API changes in 1.3.0.
- npm metadata: a clearer description, more search keywords (expo-router, universal-links, app-links, install-referrer, firebase-dynamic-links…) and the homepage now points at https://deeplinknow.com/docs/react-native.
- Additive only: no existing export or behaviour changes.

## 1.2.1 (2026-10-20)

- Requires React Native 0.81 or later (Expo SDK 54) and uses `BaseReactPackage` on the new architecture (RN-22).

## 1.2.0 (2026-10-19)

- `checkDeferredDeepLink(options)`, typed errors, `lastError`, and calls that never reject (SDK-85). See the README.
