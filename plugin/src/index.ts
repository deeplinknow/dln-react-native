import { type ConfigPlugin, createRunOncePlugin } from "@expo/config-plugins";

import { withDeepLinkNowAndroid } from "./withDeepLinkNowAndroid";
import { withDeepLinkNowiOS } from "./withDeepLinkNowiOS";

const pkg = require("../../package.json");

interface DeepLinkNowPluginProps {
  iosDeploymentTarget?: string;
  androidMinSdkVersion?: number;
}

const withDeepLinkNow: ConfigPlugin<DeepLinkNowPluginProps | void> = (
  config,
  props = {},
) => {
  config = withDeepLinkNowiOS(config, props);
  config = withDeepLinkNowAndroid(config, props);
  return config;
};

export default createRunOncePlugin(withDeepLinkNow, pkg.name, pkg.version);
