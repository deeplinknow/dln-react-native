import type { DeepLinkNowConfig } from "@deeplinknow/react-native";

// "test_api_key" is DeepLinkNow's demo key (returns sample data). To test real links, put
// your app's public key (Dashboard → your app → API keys) in dln-example/.env.local as
// EXPO_PUBLIC_DLN_API_KEY=... (git ignores .env*.local) and restart Metro.
export const DLN_API_KEY = process.env.EXPO_PUBLIC_DLN_API_KEY || "test_api_key";

// Pass the same config everywhere you pass the key: identical initialize calls made while
// one is in flight share it.
export const DLN_CONFIG: DeepLinkNowConfig = { enableLogs: true };
