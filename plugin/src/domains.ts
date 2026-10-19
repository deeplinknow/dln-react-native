export interface DeepLinkNowPluginProps {
  /** Link domains, e.g. `["myapp.deeplinknow.com", "go.myapp.com"]`. */
  domains?: string[];
}

/** Lowercases, strips scheme/path/port/trailing dot, drops empties and duplicates. */
export function normalizeDomains(domains: unknown): string[] {
  if (domains === undefined || domains === null) {
    return [];
  }
  if (!Array.isArray(domains)) {
    throw new Error(
      "[@deeplinknow/react-native] plugin option `domains` must be an array of host names"
    );
  }
  const out: string[] = [];
  for (const d of domains) {
    if (typeof d !== "string") {
      continue;
    }
    let h = d.trim().toLowerCase();
    h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    [h] = h.split(/[/?#]/);
    h = h.replace(/:\d+$/, "").replace(/\.$/, "");
    if (!(h && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h))) {
      continue;
    }
    if (!out.includes(h)) {
      out.push(h);
    }
  }
  return out;
}
