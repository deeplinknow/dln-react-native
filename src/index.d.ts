import type { MatchResponse } from "./types";
export type {
  MatchRequestBody,
  MatchResponse,
  Fingerprint,
  DeeplinkMatch,
  FingerprintMatch,
  InitResponse,
} from "./types";
export interface DeepLinkNowConfig {
  enableLogs?: boolean;
  apiKey?: string;
  customDomain?: string;
}
export type DeferredUserResponse = MatchResponse;
declare class DeepLinkNow {
  private apiKey;
  private config;
  private installTime;
  private validDomains;
  private log;
  private warn;
  private getFingerprint;
  private makeRequest;
  initialize(apiKey: string, config?: DeepLinkNowConfig): Promise<void>;
  isValidDomain(domain: string): boolean;
  parseDeepLink(url: string): {
    path: string;
    parameters: Record<string, string>;
  } | null;
  findDeferredUser(): Promise<MatchResponse | null>;
}
declare const _default: DeepLinkNow;
export default _default;
