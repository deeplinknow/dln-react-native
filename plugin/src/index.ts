import { type ConfigPlugin, createRunOncePlugin } from "@expo/config-plugins";

import { type DeepLinkNowPluginProps, normalizeDomains } from "./domains";
import { withDeepLinkNowAndroid } from "./withDeepLinkNowAndroid";
import { withDeepLinkNowiOS } from "./withDeepLinkNowiOS";

const pkg = require("../../package.json");

/**
 * Expo config plugin.
 *
 * ```json
 * ["@deeplinknow/react-native", { "domains": ["myapp.deeplinknow.com", "go.myapp.com"] }]
 * ```
 * adds `applinks:<domain>` to `ios.associatedDomains` and one auto-verified https
 * VIEW intent filter per domain to `android.intentFilters`. Without props it does nothing.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: Expo's `ConfigPlugin<Props | void>` idiom; `void` (unlike `undefined`) lets callers omit the props argument.
const withDeepLinkNow: ConfigPlugin<DeepLinkNowPluginProps | void> = (
  config,
  props
) => {
  const domains = normalizeDomains(props ? props.domains : undefined);
  if (domains.length === 0) {
    return config;
  }
  config = withDeepLinkNowiOS(config, { domains });
  config = withDeepLinkNowAndroid(config, { domains });
  return config;
};

export type { DeepLinkNowPluginProps } from "./domains";
export default createRunOncePlugin(withDeepLinkNow, pkg.name, pkg.version);
