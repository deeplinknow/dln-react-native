# Changelog

All notable changes to `@deeplinknow/react-native`. iOS, Android and React Native share one major.minor version (SDK-84).

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
