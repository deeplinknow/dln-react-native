import type { ConfigPlugin } from "@expo/config-plugins";

/** Adds `applinks:<domain>` for each domain to `ios.associatedDomains` (no duplicates). */
export const withDeepLinkNowiOS: ConfigPlugin<{ domains: string[] }> = (
  config,
  { domains }
) => {
  if (!domains.length) {
    return config;
  }
  const existing = config.ios?.associatedDomains ?? [];
  const lower = new Set(existing.map((d) => d.toLowerCase()));
  const added = domains
    .map((d) => `applinks:${d}`)
    .filter((entry) => !lower.has(entry.toLowerCase()));
  config.ios = {
    ...config.ios,
    associatedDomains: [...existing, ...added],
  };
  return config;
};
