# @deeplinknow/react-native

React Native SDK for DeepLink Now - handle deferred deep linking in your React Native app.

## Installation

```sh
bun add @deeplinknow/react-native
// or
yarn add @deeplinknow/react-native
// or
npm install @deeplinknow/react-native
```

### iOS

The iOS SDK requires iOS 13.0 or later. After installation, run:

```sh
cd ios && pod install
```

### Android

The Android SDK requires minSdkVersion 21 or later. No additional steps required.

## Usage

```typescript
import DeepLinkNow from "@deeplinknow/react-native";

// Initialize the SDK
DeepLinkNow.initialize("your-api-key");
```

## Requirements

- iOS 13.0 or later
- Android API level 21 or later
- React Native 0.60 or later

## License

MIT
