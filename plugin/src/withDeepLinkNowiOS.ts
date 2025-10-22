import type { ConfigPlugin } from "@expo/config-plugins";

interface DeepLinkNowPluginProps {
  iosDeploymentTarget?: string;
  androidMinSdkVersion?: number;
}

export const withDeepLinkNowiOS: ConfigPlugin<DeepLinkNowPluginProps | void> = (
  config,
) => {
  // iOS-specific configuration for DeepLinkNow
  // The native module will be auto-linked via Expo's autolinking
  return config;
};
