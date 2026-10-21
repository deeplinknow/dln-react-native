# @deeplinknow/react-native

React Native and Expo SDK for [DeepLinkNow](https://deeplinknow.com): deferred deep linking without the ad-tracking baggage.

It does two things:

1. **Initialize**: validate your API key and load your app's link domains.
2. **Return the deferred deep link**: the path and query the user tapped before installing your app, with where the answer came from and how sure DeepLinkNow is.

The package wraps the native iOS and Android SDKs, so React Native returns the same data as the native SDKs.

## Requirements

- React Native 0.81 or later (old and new architecture), or Expo SDK 54 or later with a development build. Expo Go has no native code (see [Expo Go](#expo-go-degraded-mode)).
- iOS 13 or later
- Android API 24 (Android 7.0) or later

## Installation

### Expo (development build)

```sh
npx expo install @deeplinknow/react-native
```

Add the config plugin with your link domains. It adds `applinks:<domain>` to the iOS Associated Domains and an auto-verified App Links intent filter on Android for each domain:

```json
{
  "expo": {
    "plugins": [
      ["@deeplinknow/react-native", { "domains": ["myapp.deeplinknow.com", "go.myapp.com"] }]
    ]
  }
}
```

Then rebuild the native projects: `npx expo prebuild` (or let EAS Build do it), then `npx expo run:ios` / `npx expo run:android`.

### Bare React Native

```sh
npm install @deeplinknow/react-native
cd ios && pod install
```

If `pod install` (or `npx expo prebuild`) says no spec satisfies `DeepLinkNow (~> 1.3.0)`, your local CocoaPods spec cache is older than the release. Run `cd ios && pod install --repo-update` once.

Autolinking picks the right native module (TurboModule on the new architecture, bridge module on the old one). Add the link domains by hand:

- **iOS**: Xcode → Signing & Capabilities → Associated Domains → `applinks:myapp.deeplinknow.com` (plus `applinks:<custom-domain>`).
- **Android**: an `autoVerify` intent filter in `AndroidManifest.xml`:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="myapp.deeplinknow.com" />
</intent-filter>
```

## Quick start

```ts
import DeepLinkNow from "@deeplinknow/react-native";

async function handleDeferredDeepLink() {
  await DeepLinkNow.initialize("your-public-api-key");

  // First launch only: iOS reads the pasteboard, then fingerprints.
  // Android reads the Play Install Referrer, then fingerprints.
  const link = await DeepLinkNow.checkDeferredDeepLink();
  if (link) {
    // e.g. link.path = "/products/123", link.queryParams = { ref: "newsletter" }
    navigate(link.path, link.queryParams);
  }
  // No link (or a failure such as being offline): carry on to your normal start screen.
}
```

Using Expo Router? Use the [Expo Router](#expo-router) helper instead: it opens the app straight on the link.

None of these calls throw or reject, so no `try`/`catch` is needed. A failure resolves `null`, is logged as a warning, and is kept in `DeepLinkNow.lastError` (see [Errors](#errors)).

For links that open an already-installed app (Universal Links / App Links), use React Native's `Linking` and `parseDeepLink`, so deferred and direct opens route the same way:

```ts
import { Linking } from "react-native";

Linking.addEventListener("url", ({ url }) => {
  const parsed = DeepLinkNow.parseDeepLink(url);
  if (parsed) navigate(parsed.path, parsed.queryParams);
});
```

## Expo Router

With Expo Router, resolve the deferred deep link in `app/+native-intent.tsx`. Expo Router calls it with the launch URL before the first screen mounts, so on the first launch after install the app opens straight on the link the user tapped: no flash of the home screen, and no race with redirects in your layouts.

```tsx
// app/+native-intent.tsx
import { createRedirectSystemPath } from "@deeplinknow/react-native/expo-router";

export const redirectSystemPath = createRedirectSystemPath({
  apiKey: "your-public-api-key",
});
```

That's the whole integration. The helper:

- **First launch after install** (opened from the store or the home screen): initializes the SDK, runs `checkDeferredDeepLink()` and returns the link's `fullPath`, e.g. `/products/123?ref=newsletter`, as the initial route. It waits at most `timeoutMs` (default 3000) and then starts the app on its normal route.
- **Opened by a link on your DeepLinkNow domains** (`alias.deeplinknow.com` or a verified custom domain), on any launch: returns the link's in-app path.
- **Anything else** (later launches, other URLs, your own custom-scheme links): returns the path unchanged.

It never throws. On a failure or timeout the app starts where it would have without DeepLinkNow, and `DeepLinkNow.lastError` says why. The helper initializes the SDK itself, so you don't need to call `DeepLinkNow.initialize` elsewhere.

Options:

| Option | Default | |
|---|---|---|
| `apiKey` | required | Your public API key |
| `config` | `{}` | Passed to `initialize` (`enableLogs`, `baseUrl`, `timeoutMs`, `retryAttempts`) |
| `minConfidence` | off | Ignore fingerprint matches below this score (0-100) |
| `useClipboard` | `true` | iOS: check the pasteboard first |
| `timeoutMs` | `3000` | Longest wait on the first launch. `0` never waits |
| `mapUniversalLinks` | `true` | Rewrite links on your DeepLinkNow domains to their in-app path |
| `mapLink` | `link.fullPath` | `(link, source) => href \| null` when your routes don't match your link paths. `source` is `"deferred"` or `"universal"`. Return `null` to keep the incoming path |

```tsx
export const redirectSystemPath = createRedirectSystemPath({
  apiKey: "your-public-api-key",
  minConfidence: 50,
  mapLink: (link) => (link.path.startsWith("/p/") ? `/products/${link.path.slice(3)}` : link.fullPath),
});
```

To add your own rewrites, call `redirectSystemPathWithDeferredLink(event, options)` from your own `redirectSystemPath`.

### Sign-in first, and late links

A deferred link found after `timeoutMs` (a slow network), or one you want to open only after sign-in, comes from `useDeferredDeepLink()`. It shares the helper's check, so nothing runs twice, and a link the helper already routed to comes back as `null`:

```tsx
// app/_layout.tsx
import { useDeferredDeepLink } from "@deeplinknow/react-native";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";

export default function RootLayout() {
  const { link, clear } = useDeferredDeepLink();
  const { isSignedIn } = useAuth(); // your auth
  const router = useRouter();

  useEffect(() => {
    if (link && isSignedIn) {
      clear(); // handle it once
      router.push(link.fullPath);
    }
  }, [link, isSignedIn]);

  return <Stack />;
}
```

To always deliver through the hook (for example, when every deep link needs a signed-in user), pass `timeoutMs: 0` to `createRedirectSystemPath`.

## API

The default export is a singleton.

### `initialize(apiKey, config?): Promise<DLNAppInfo | null>`

Validates the key with `POST /api/v1/sdk/init` (one request per call) and loads your link domains (`{alias}.deeplinknow.com` plus verified custom domains).

```ts
type DeepLinkNowConfig = {
  enableLogs?: boolean;     // default false; logs use the "[DeepLinkNow]" prefix, never the API key
  baseUrl?: string;         // default "https://deeplinknow.com"
  timeoutMs?: number;       // per request, default 10000
  retryAttempts?: number;   // transient failures (network, 5xx, 429), default 2
};

type DLNAppInfo = {
  id: string;
  alias: string;
  domains: string[];
  accountStatus: string;
  creditsRemaining: number | null;
  rateLimits?: Record<string, number> | null;
};
```

Resolves `null` when initialization fails (it never rejects); the error is in `DeepLinkNow.lastError`. Calling it again replaces the previous config. Concurrent identical calls share one request.

### `isInitialized(): boolean`

Whether a successful `initialize` has completed.

### `checkDeferredDeepLink(options?): Promise<DeferredDeepLink | null>`

The one call. It runs the platform chain and stops at the first step that finds a link:

| Platform | 1st | 2nd |
|---|---|---|
| iOS | Pasteboard: the landing page copied the link before sending the user to the App Store (exact) | Fingerprint match (best effort) |
| Android | Play Install Referrer (exact) | Fingerprint match (best effort) |

It does the work once per install. After a definitive answer (a link, or nothing found), later calls resolve `null` without touching the network, clipboard or referrer, unless you pass `force: true`. Errors (offline, 5xx, not initialized, …) also resolve `null`, never reject, and do not mark the check as done, so the next call tries again. The error is in `DeepLinkNow.lastError`.

```ts
type DeferredDeepLinkOptions = {
  minConfidence?: number; // discard fingerprint candidates below this score; off by default
  useClipboard?: boolean; // iOS: read the pasteboard first (default true). Ignored on Android
  force?: boolean;        // ignore the "already checked" flag
};

type DeferredDeepLink = {
  path: string;                                          // "/products/123" (not decoded)
  queryParams: Record<string, string | true | string[]>; // { ref: "newsletter" }
  fullPath: string;                                      // "/products/123?ref=newsletter" (raw)
  url: string;                                           // absolute https URL of the link
  source: "referrer" | "clipboard" | "fingerprint";
  confidenceScore: number;                               // 100 for referrer and clipboard
  matchQuality: "HIGH" | "MEDIUM" | "LOW";               // "HIGH" for referrer and clipboard
  deeplinkId?: string;
  targetUrl?: string;
  campaignId?: string | null;
  metadata?: Record<string, any>;
  matchedAt?: string;
  expiresAt?: string;
  matchDetails?: MatchDetails;                           // fingerprint only
};
```

`queryParams` follows `URLSearchParams`: `+` is a space, a key seen once is a string, a flag (`?debug` or `?debug=`) is `true`, and a repeated key is an array (`?tag=a&tag=b` → `["a", "b"]`).

**Choosing a threshold.** Fingerprinting is a backup. On iOS the IP address is often masked (iCloud Private Relay), so DeepLinkNow returns honest scores and you decide. The server labels scores `HIGH` (≥ 75), `MEDIUM` (50–74) and `LOW` (30–49). For example, act only on `HIGH`, or pass `minConfidence: 50`.

**iOS paste prompt.** On iOS 16+, reading the pasteboard shows "Allow Paste" if another app (Safari) wrote it. Declining counts as "nothing found" and the chain continues to fingerprinting. Pass `useClipboard: false` to skip the pasteboard.

### `resetDeferredDeepLink(): Promise<void>`

Clears the "already checked" flag and any cached referrer result, both in memory and on disk. Useful when testing.

### `findDeferredUser(): Promise<MatchResponse | null>`

Low level. Returns every fingerprint candidate from `/api/v1/sdk/match`, unfiltered, in the server's snake_case shape:

```ts
type MatchResponse = {
  matches: Array<{
    confidence_score: number;
    match_quality?: "HIGH" | "MEDIUM" | "LOW";
    match_details: MatchDetails;
    deeplink?: {
      id: string;
      target_url: string;
      metadata: Record<string, any>;
      campaign_id?: string | null;
      matched_at: string;
      expires_at: string;
      query_params?: Record<string, string | true | string[]>;
      full_path?: string;
    };
  }>;
  ttl_seconds: number;
};
```

Zero matches is a successful empty response (`matches: []`). A failure resolves `null` (it never rejects), with the error in `DeepLinkNow.lastError`.

### `getReferrerData(): Promise<ReferrerData | null>`

Android only (`null` on iOS). The raw Play Install Referrer result: `{ referrerString, fpId?, deeplinkId?, deeplinkData?, processedAt }`.

### `checkClipboard(): Promise<string | null>`

Returns the clipboard text only if the whole text is a link on one of your app's domains. Otherwise it returns `null`. On iOS this can show the paste prompt.

### `hasDeepLinkToken(): Promise<boolean>`

A cheap check that never shows the paste prompt. `true` means "worth calling `checkClipboard()`", not "verified".

### `parseDeepLink(url): ParsedDeepLink | null`

Synchronous. Returns `{ path, queryParams, fullPath, url }` for an `http(s)` link whose host is exactly one of your app's link domains (case-insensitive), otherwise `null`. Other apps' `*.deeplinknow.com` subdomains and lookalike hosts are rejected.

```ts
DeepLinkNow.parseDeepLink("https://myapp.deeplinknow.com/s?q=red+shoes&tag=a&tag=b");
// { path: "/s", queryParams: { q: "red shoes", tag: ["a", "b"] }, fullPath: "/s?q=red+shoes&tag=a&tag=b", url: "…" }
```

### `isValidDomain(host): boolean`

The host rule used by `parseDeepLink` and `checkClipboard`.

### `useDeferredDeepLink(options?): { link, isLoading, clear }`

A React hook (named export) for the deferred deep link. It runs `checkDeferredDeepLink()` once per app process, on mount, unless it already ran (from the Expo Router helper or another component), and shares the result. Options: `apiKey` and `config` (initialize first when the SDK isn't initialized), `minConfidence`, `useClipboard`, and `enabled` (default `true`). `link` is `null` until a link is found, after `clear()`, and when the Expo Router helper already routed to it. Without Expo Router:

```tsx
const { link, clear } = useDeferredDeepLink({ apiKey: "your-public-api-key" });
useEffect(() => {
  if (link) {
    clear();
    navigation.navigate("Product", { path: link.path, params: link.queryParams });
  }
}, [link]);
```

### `getModuleType()` / `isNativeModuleAvailable()`

Named exports. `getModuleType()` returns `"expo" | "turbo" | "bridge" | "none"`.

### `lastError: DLNError | null`

The error from the most recent failed `initialize`, `checkDeferredDeepLink` or `findDeferredUser`, or `null`. The next successful call of the same kind clears it. Use it to tell "nothing found" from "something failed":

```ts
const link = await DeepLinkNow.checkDeferredDeepLink();
if (!link && DeepLinkNow.lastError) {
  console.log("DeepLinkNow:", DeepLinkNow.lastError.code, DeepLinkNow.lastError.message);
}
```

### Errors

`initialize`, `checkDeferredDeepLink` and `findDeferredUser` never reject: they resolve `null`, log a warning (even with `enableLogs: false`) and set `lastError`. `resetDeferredDeepLink` rejects if the native reset fails. Errors are `DLNError` instances (`e.code`, plus `e.status` and `e.serverMessage` when the server sent one). The codes are the same on iOS and Android:

| Code | Meaning |
|---|---|
| `notInitialized` | `initialize` was not called or failed (`e.cause` holds the init error) |
| `invalidApiKey` | 401 |
| `accountInactive` | 403 "Account is not active" |
| `noCredits` | 403 "No credits remaining" |
| `rateLimited` | 429 |
| `badRequest` | 400 / invalid configuration |
| `server` | 5xx |
| `network` | offline, timeout, transport error |
| `invalidResponse` | an unexpected response |

## Expo Go (degraded mode)

Expo Go can't load native code, so `getModuleType()` is `"none"` and the SDK falls back to calling the REST API from JavaScript. Only the fingerprint step works there. Install referrer and clipboard need a development build. The SDK logs one warning when this happens. Results have the same shapes.

## Privacy

The SDK never reads the IDFA or the Google Advertising ID and never triggers the App Tracking Transparency prompt. It sends only what matching needs: OS and version, device class, screen size, language, time zone and an app-scoped install ID (IDFV / `ANDROID_ID`). The server sees the connection's IP address. The SDK reads the clipboard only during the first iOS `checkDeferredDeepLink` (unless `useClipboard: false`) or when you call `checkClipboard()`, and it never writes to it. On device it stores only the "already checked" flag, on Android the referrer result, and a copy of the last `/init` result (public key, link domains and app info, no device data) so launches within 24 hours skip the network call.

## Upgrading from 1.1

The 1.2 API is additive, but a few behaviors changed to match the native SDKs:

- `initialize` now resolves with `DLNAppInfo` (it used to resolve `undefined`). Like 1.1 it never rejects: on failure it resolves `null`, logs a warning and sets `DeepLinkNow.lastError`. Code written for 1.1 keeps working without a `try`/`catch`.
- `checkDeferredDeepLink()` now works on iOS too and returns a `DeferredDeepLink` (`path`, `queryParams`, `source`, …). The old referrer fields `targetUrl`, `campaignId`, `metadata`, `matchedAt` and `expiresAt` are still there, and `id` is a deprecated alias of `deeplinkId`. The referrer-only fields are optional now, because clipboard results don't have them.
- `findDeferredUser()` returns the snake_case server shape on every platform (with native modules it used to return camelCase), and adds `match_quality`, `deeplink.query_params` and `deeplink.full_path`. As in 1.1, a failure resolves `null`; the error is now also available as `DeepLinkNow.lastError`.
- `parseDeepLink()` adds `queryParams`, `fullPath` and `url`. `parameters` is kept as a deprecated flat string map.
- New: `DeepLinkNow.lastError` holds the typed `DLNError` of the last failed call, so you can tell "nothing found" from "something failed" without a `try`/`catch`.
- `clearReferrerCache()` is deprecated. Use `resetDeferredDeepLink()`, which works on both platforms.
- `*.deeplink.now` hosts are no longer trusted. They were never DeepLinkNow domains.
- The `config.apiKey` field is ignored. Pass the key as the first argument.

## License

MIT
