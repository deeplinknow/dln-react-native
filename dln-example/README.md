# DeepLinkNow Expo example

An Expo (development build) app that shows the whole `@deeplinknow/react-native` integration on one screen: `app/(tabs)/index.tsx`.

1. `DeepLinkNow.initialize(apiKey)` at startup. It rejects with a `DLNError` (`code`, `message`), which the screen shows.
2. `DeepLinkNow.checkDeferredDeepLink({ minConfidence })` once, on first launch. The screen shows `path`, `queryParams`, `fullPath`, `source`, `confidenceScore` and `matchQuality`.
3. `DeepLinkNow.parseDeepLink(url)` for Universal Links / App Links that open the installed app. `app/+native-intent.tsx` sends every incoming link to the home screen so Expo Router doesn't show "Unmatched route".

For testing, the screen also has a **minConfidence** picker (Off / 30 / 50 / 75), **Check again (force)** and **Reset deferred link** (`resetDeferredDeepLink()`).

The DeepLinkNow config plugin is in `app.json`:

```json
["@deeplinknow/react-native", { "domains": ["dln-example.deeplinknow.com", "go.example.com"] }]
```

It adds `applinks:<domain>` (iOS Associated Domains) and an auto-verified App Links intent filter (Android) for each domain. Replace the domains and `API_KEY` in `app/(tabs)/index.tsx` with your app's values. `test_api_key` is DeepLinkNow's demo key and returns sample data.

This app does not run in Expo Go, which has no DeepLinkNow native code. Use a development build.

## Run

```bash
pnpm install
npx expo prebuild --clean
npx expo run:ios       # or: npx expo run:android
```

To build without running:

```bash
cd ios && pod install && xcodebuild build -workspace dlnexample.xcworkspace -scheme dlnexample \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17'
cd android && ./gradlew assembleDebug   # JDK 17+
```

## Local SDKs (default) vs published SDKs

Until the SDKs are published, the example builds everything from this repository:

| Piece | Local (default) | Where it is set |
|---|---|---|
| `@deeplinknow/react-native` | `"file:../"` (the package in `packages/dln-rn`) | `package.json` |
| iOS `DeepLinkNow` pod | `pod 'DeepLinkNow', :path => '../../../dln-ios'` | `plugins/withLocalDeepLinkNowSdks.js` writes it into the generated `ios/Podfile` |
| Android `com.deeplinknow:dln-android` | Gradle module `:dln-android-local` (`plugins/dln-android-local/build.gradle`), which compiles `packages/dln-android/src/main` with this app's Android Gradle Plugin and replaces the Maven artifact through dependency substitution | `plugins/withLocalDeepLinkNowSdks.js` writes it into the generated `android/settings.gradle` and `android/build.gradle` |

`file:../` is installed as a copy by pnpm. Rebuild the package and reinstall after changing it:

```bash
cd .. && npx tsc -p tsconfig.json && npx tsc -p plugin/tsconfig.json && cd dln-example
pnpm install --force
```

The Android SDK is not an included build because `packages/dln-android` pins AGP 8.3.2, Expo SDK 54 uses AGP 8.11, and Gradle doesn't allow two AGP versions in one build. If you change the dependencies in `packages/dln-android/build.gradle.kts`, change them in `plugins/dln-android-local/build.gradle` too.

### Switching to the published versions

After DeepLinkNow 1.1.0 (CocoaPods), `com.deeplinknow:dln-android` 1.1.0 (Maven) and `@deeplinknow/react-native` 1.2.0 (npm) are published:

1. Native SDKs: in `plugins/withLocalDeepLinkNowSdks.js`, set `const USE_LOCAL_NATIVE_SDKS = false;`. The RN package then pulls `DeepLinkNow ~> 1.1.0` and `dln-android:1.1.0` (the versions in its `package.json` `"deeplinknow"` field). You can also delete the plugin's `app.json` entry.
2. RN package: in `package.json`, change `"@deeplinknow/react-native": "file:../"` to `"@deeplinknow/react-native": "1.2.0"`.
3. Run `pnpm install && npx expo prebuild --clean`.
