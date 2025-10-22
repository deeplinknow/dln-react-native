import type { ConfigPlugin } from "@expo/config-plugins";

interface DeepLinkNowPluginProps {
  iosDeploymentTarget?: string;
  androidMinSdkVersion?: number;
}

export const withDeepLinkNowAndroid: ConfigPlugin<
  DeepLinkNowPluginProps | void
> = (config) => {
  // Android-specific configuration for DeepLinkNow
  // The native module will be auto-linked via Expo's autolinking
  return config;
};
