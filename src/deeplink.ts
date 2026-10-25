/**
 * Pure helpers for the JS REST fallback (used only when no native module exists).
 * They follow the same rules as the native SDKs:
 *   - host rule: SDK-31/32/33/37
 *   - path / fullPath: SDK-34/36 (FLOW-51/52), never decoded
 *   - queryParams: SDK-35 (FLOW-53), WHATWG URLSearchParams semantics
 *
 * React Native's built-in `URL` is incomplete (no reliable hostname/searchParams on
 * older versions) and decodes paths, so URLs are split by hand here.
 */
import type {
  DeeplinkMatch,
  DeferredDeepLink,
  Match,
  MatchQuality,
  MatchResponse,
  ParsedDeepLink,
  QueryParams,
} from "./types";

export const DLN_ROOT_DOMAIN = "deeplinknow.com";
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "docs",
  "m",
  "mail",
]);

// ---------------------------------------------------------------------------
// Percent-decoding with WHATWG semantics (invalid escapes stay literal,
// invalid UTF-8 becomes U+FFFD).
// ---------------------------------------------------------------------------

function utf8Decode(bytes: number[]): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    let need = 0;
    let cp = 0;
    let lower = 0x80;
    let upper = 0xbf;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
      continue;
    }
    if (b0 >= 0xc2 && b0 <= 0xdf) {
      need = 1;
      cp = b0 & 0x1f;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      need = 2;
      cp = b0 & 0x0f;
      if (b0 === 0xe0) {
        lower = 0xa0;
      }
      if (b0 === 0xed) {
        upper = 0x9f;
      }
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      need = 3;
      cp = b0 & 0x07;
      if (b0 === 0xf0) {
        lower = 0x90;
      }
      if (b0 === 0xf4) {
        upper = 0x8f;
      }
    } else {
      out += "\uFFFD";
      i += 1;
      continue;
    }
    let j = 1;
    for (; j <= need; j += 1) {
      const b = bytes[i + j];
      const lo = j === 1 ? lower : 0x80;
      const hi = j === 1 ? upper : 0xbf;
      if (b === undefined || b < lo || b > hi) {
        break;
      }
      cp = (cp << 6) | (b & 0x3f);
    }
    if (j <= need) {
      // Maximal subpart replaced by a single U+FFFD.
      out += "\uFFFD";
      i += j;
      continue;
    }
    out += String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}

const HEX = /^[0-9a-fA-F]{2}$/;

/** application/x-www-form-urlencoded decoding of one key or value. */
export function formDecode(input: string): string {
  const s = input.replace(/\+/g, " ");
  if (s.indexOf("%") === -1) {
    return s;
  }
  let out = "";
  let bytes: number[] = [];
  const flush = () => {
    if (bytes.length) {
      out += utf8Decode(bytes);
      bytes = [];
    }
  };
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === "%" && HEX.test(s.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      flush();
      out += c;
    }
  }
  flush();
  return out;
}

/** SDK-35 / FLOW-53. `query` is the part after `?` (no fragment). */
export function parseQueryParams(
  query: string | null | undefined
): QueryParams {
  const grouped = new Map<string, string[]>();
  for (const piece of (query ?? "").split("&")) {
    if (piece === "") {
      continue;
    }
    const eq = piece.indexOf("=");
    const key = formDecode(eq === -1 ? piece : piece.slice(0, eq));
    const value = eq === -1 ? "" : formDecode(piece.slice(eq + 1));
    const list = grouped.get(key);
    if (list) {
      list.push(value);
    } else {
      grouped.set(key, [value]);
    }
  }
  const out: QueryParams = {};
  grouped.forEach((values, key) => {
    out[key] = values.length > 1 ? values : values[0] === "" ? true : values[0];
  });
  return out;
}

/** Legacy flat `parameters` map: last value wins, flags become "". */
export function toLegacyParameters(q: QueryParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    out[k] = v === true ? "" : Array.isArray(v) ? (v[v.length - 1] ?? "") : v;
  }
  return out;
}

/** SDK-34: path from fullPath. */
export function pathFromFullPath(fullPath: string): string {
  const q = fullPath.indexOf("?");
  const p = q === -1 ? fullPath : fullPath.slice(0, q);
  return p === "" ? "/" : p;
}

export function queryFromFullPath(fullPath: string): string {
  const q = fullPath.indexOf("?");
  return q === -1 ? "" : fullPath.slice(q + 1);
}

// ---------------------------------------------------------------------------
// URL splitting and host rule
// ---------------------------------------------------------------------------

export interface SplitUrl {
  fullPath: string;
  host: string;
  path: string;
  query: string;
  scheme: string;
}

const URL_RE =
  /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/;
const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

/** Lowercase, drop port and a trailing dot (SDK-31). Returns null if not a plausible DNS host. */
export function normalizeHost(rawHost: string): string | null {
  if (typeof rawHost !== "string") {
    return null;
  }
  let h = rawHost.trim().toLowerCase();
  const colon = h.lastIndexOf(":");
  if (colon !== -1) {
    const port = h.slice(colon + 1);
    if (!/^\d*$/.test(port)) {
      return null;
    }
    h = h.slice(0, colon);
  }
  if (h.endsWith(".")) {
    h = h.slice(0, -1);
  }
  if (!(h && HOST_RE.test(h))) {
    return null;
  }
  return h;
}

/** Splits an absolute http(s) URL without decoding anything. Returns null on malformed input. */
export function splitUrl(url: unknown): SplitUrl | null {
  if (typeof url !== "string") {
    return null;
  }
  const s = url.trim();
  if (!s || /\s/.test(s)) {
    return null;
  }
  const m = URL_RE.exec(s);
  if (!m) {
    return null;
  }
  const [, rawScheme, authority, rawPathMatch, queryPart] = m; // queryPart includes "?"
  const scheme = rawScheme.toLowerCase();
  if (scheme !== "https" && scheme !== "http") {
    return null;
  }
  if (!authority || authority.includes("@")) {
    return null;
  }
  const host = normalizeHost(authority);
  if (!host) {
    return null;
  }
  const rawPath = rawPathMatch || "";
  const path = rawPath === "" ? "/" : rawPath;
  const fullPath = path + (queryPart ?? "");
  return {
    scheme,
    host,
    fullPath,
    path,
    query: queryPart ? queryPart.slice(1) : "",
  };
}

/**
 * SDK-31 / SDK-37 host rule.
 * `domains` is the trusted set after a successful init, or null before init.
 */
export function isTrustedHost(
  host: string,
  domains: Set<string> | null
): boolean {
  const h = normalizeHost(host);
  if (!h) {
    return false;
  }
  if (h === "deeplink.now" || h.endsWith(".deeplink.now")) {
    return false;
  }
  if (domains) {
    return domains.has(h);
  }
  // Provisional rule before init: a single non-reserved label under deeplinknow.com.
  const suffix = `.${DLN_ROOT_DOMAIN}`;
  if (!h.endsWith(suffix)) {
    return false;
  }
  const label = h.slice(0, -suffix.length);
  return !!label && !label.includes(".") && !RESERVED_SUBDOMAINS.has(label);
}

export function parseDeepLinkJS(
  url: unknown,
  domains: Set<string> | null
): ParsedDeepLink | null {
  try {
    const parts = splitUrl(url);
    if (!(parts && isTrustedHost(parts.host, domains))) {
      return null;
    }
    const queryParams = parseQueryParams(parts.query);
    return {
      path: parts.path,
      queryParams,
      fullPath: parts.fullPath,
      url: stripDlnFragment((url as string).trim()),
      parameters: toLegacyParameters(queryParams),
    };
  } catch {
    return null;
  }
}

/**
 * SDK-92: removes a `dln` fragment parameter (`#dln=<click id>`, added by the link page to
 * the URL it copies) from a URL. Other fragment parameters are kept; a URL without one is
 * returned unchanged.
 */
export function stripDlnFragment(url: string): string {
  const hash = url.indexOf("#");
  if (hash === -1) {
    return url;
  }
  const pieces = url.slice(hash + 1).split("&");
  const kept = pieces.filter((piece) => !/^dln(=|$)/.test(piece));
  if (kept.length === pieces.length) {
    return url;
  }
  const base = url.slice(0, hash);
  const rest = kept.filter((piece) => piece !== "");
  return rest.length ? `${base}#${rest.join("&")}` : base;
}

const SCHEME_URL = /^([a-zA-Z][a-zA-Z0-9+.-]*):(\S*)$/;

/**
 * Parses a URL on the app's own scheme (SDK-87): `myapp://products/1?x=1`,
 * `myapp:///products/1` and `myapp:products/1` all give `fullPath` `/products/1?x=1`-style
 * results (the "host" is part of the path, as in Expo Router). Expo Go / dev-client URLs
 * (`exp://…/--/products/1`) use the part after `/--/`. Returns null for http(s), for an
 * Expo URL without `/--/`, and for the bare root (`myapp://`, `myapp:///`), which is a launch
 * without a link. Nothing is decoded; the fragment is not part of the path.
 */
export function parseSchemeLink(url: unknown): ParsedDeepLink | null {
  if (typeof url !== "string") {
    return null;
  }
  const trimmed = url.trim();
  const m = SCHEME_URL.exec(trimmed);
  if (!m) {
    return null;
  }
  const [, rawScheme, afterScheme] = m;
  const scheme = rawScheme.toLowerCase();
  if (scheme === "http" || scheme === "https") {
    return null;
  }
  let rest = afterScheme;
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    rest = rest.slice(0, hash);
  }
  if (scheme === "exp" || scheme === "exps" || scheme.startsWith("exp+")) {
    const expoPath = rest.indexOf("/--/");
    if (expoPath === -1) {
      return null;
    }
    rest = rest.slice(expoPath + 4);
  }
  const fullPath = `/${rest.replace(/^\/+/, "")}`;
  if (fullPath === "/" || fullPath === "/?") {
    return null;
  }
  const queryParams = parseQueryParams(queryFromFullPath(fullPath));
  return {
    path: pathFromFullPath(fullPath),
    queryParams,
    fullPath,
    url: stripDlnFragment(trimmed),
    parameters: toLegacyParameters(queryParams),
  };
}

// ---------------------------------------------------------------------------
// Server results → DeferredDeepLink (fingerprint step of the fallback)
// ---------------------------------------------------------------------------

export function qualityForScore(score: number): MatchQuality {
  if (score >= 75) {
    return "HIGH";
  }
  if (score >= 50) {
    return "MEDIUM";
  }
  return "LOW";
}

function isQueryParams(v: unknown): v is QueryParams {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** SDK-16..19: converts a /match candidate with a deeplink. */
export function deferredFromMatch(
  match: Match,
  domains: string[]
): DeferredDeepLink | null {
  const dl = match.deeplink;
  if (!dl) {
    return null;
  }
  const targetUrl =
    typeof dl.target_url === "string" ? dl.target_url : undefined;
  let fullPath: string;
  if (typeof dl.full_path === "string" && dl.full_path.startsWith("/")) {
    fullPath = dl.full_path;
  } else if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
    // Absolute dashboard target: use its path + query.
    fullPath = splitUrl(targetUrl)?.fullPath ?? "/";
  } else if (targetUrl) {
    // On-demand links store `promo?code=…` without the leading slash (SDK-17).
    fullPath = targetUrl.startsWith("/") ? targetUrl : `/${targetUrl}`;
  } else {
    fullPath = "/";
  }
  const queryParams = isQueryParams(dl.query_params)
    ? dl.query_params
    : parseQueryParams(queryFromFullPath(fullPath));

  const trusted = new Set(domains);
  const primary =
    domains.find((d) => !d.endsWith(`.${DLN_ROOT_DOMAIN}`)) ?? domains[0];
  let url = `https://${primary}${fullPath}`;
  if (targetUrl) {
    const t = splitUrl(targetUrl);
    if (t && trusted.has(t.host)) {
      url = targetUrl;
    }
  }

  const result: DeferredDeepLink = {
    path: pathFromFullPath(fullPath),
    queryParams,
    fullPath,
    url,
    source: "fingerprint",
    confidenceScore: match.confidence_score,
    matchQuality:
      match.match_quality ?? qualityForScore(match.confidence_score),
    deeplinkId: dl.id,
    id: dl.id,
    targetUrl,
    campaignId: dl.campaign_id ?? undefined,
    // Older servers can omit metadata.
    metadata: (dl.metadata as DeeplinkMatch["metadata"] | undefined) ?? {},
    matchedAt: dl.matched_at,
    expiresAt: dl.expires_at,
    matchDetails: match.match_details,
  };
  return result;
}

/** Validates the camelCase DeferredDeepLink shape coming from a native module. */
export function isDeferredDeepLinkShape(v: unknown): v is DeferredDeepLink {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as Record<string, unknown>;
  return (
    typeof o.path === "string" &&
    typeof o.fullPath === "string" &&
    typeof o.url === "string" &&
    isQueryParams(o.queryParams) &&
    (o.source === "referrer" ||
      o.source === "clipboard" ||
      o.source === "fingerprint") &&
    typeof o.confidenceScore === "number" &&
    (o.matchQuality === "HIGH" ||
      o.matchQuality === "MEDIUM" ||
      o.matchQuality === "LOW")
  );
}

/** Validates the snake_case /match response shape. */
export function isMatchResponseShape(v: unknown): v is MatchResponse {
  if (!v || typeof v !== "object") {
    return false;
  }
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.matches) || typeof o.ttl_seconds !== "number") {
    return false;
  }
  return o.matches.every(
    (m) =>
      !!m &&
      typeof m === "object" &&
      typeof (m as Record<string, unknown>).confidence_score === "number" &&
      ((m as Record<string, unknown>).match_details === undefined ||
        typeof (m as Record<string, unknown>).match_details === "object")
  );
}

/** A parse result from a native module: `path` and `queryParams` are checked, the rest is not. */
export interface NativeParsedDeepLink {
  fullPath?: unknown;
  path: string;
  queryParams: QueryParams;
  url?: unknown;
}

export function isParsedDeepLinkShape(v: unknown): v is NativeParsedDeepLink {
  if (
    !v ||
    typeof v !== "object" ||
    typeof (v as Record<string, unknown>).then === "function"
  ) {
    return false;
  }
  const o = v as Record<string, unknown>;
  return typeof o.path === "string" && isQueryParams(o.queryParams);
}
