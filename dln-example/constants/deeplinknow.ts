import type { DeepLinkNowConfig } from "@deeplinknow/react-native";

// "test_api_key" is DeepLinkNow's demo key (returns sample data). Use your app's key from
// the dashboard (Dashboard → your app → API keys) to test real links.
export const DLN_API_KEY = "test_api_key";

// Pass the same config everywhere you pass the key: identical initialize calls made while
// one is in flight share it.
export const DLN_CONFIG: DeepLinkNowConfig = { enableLogs: true };
