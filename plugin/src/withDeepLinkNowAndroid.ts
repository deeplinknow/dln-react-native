import type { ConfigPlugin } from "@expo/config-plugins";

type IntentFilter = NonNullable<
  NonNullable<Parameters<ConfigPlugin>[0]["android"]>["intentFilters"]
>[number];

function declaresHttpsHost(filter: IntentFilter, host: string): boolean {
  const data = Array.isArray(filter.data)
    ? filter.data
    : filter.data
      ? [filter.data]
      : [];
  return data.some(
    (d) =>
      (d.host ?? "").toLowerCase() === host &&
      (d.scheme === undefined || d.scheme === "https")
  );
}

/** Adds one auto-verified https App Links intent filter per domain (no duplicates). */
export const withDeepLinkNowAndroid: ConfigPlugin<{ domains: string[] }> = (
  config,
  { domains }
) => {
  if (!domains.length) {
    return config;
  }
  const existing: IntentFilter[] = config.android?.intentFilters ?? [];
  const added: IntentFilter[] = domains
    .filter((host) => !existing.some((f) => declaresHttpsHost(f, host)))
    .map((host) => ({
      action: "VIEW",
      autoVerify: true,
      data: [{ scheme: "https", host }],
      category: ["BROWSABLE", "DEFAULT"],
    }));
  config.android = {
    ...config.android,
    intentFilters: [...existing, ...added],
  };
  return config;
};
