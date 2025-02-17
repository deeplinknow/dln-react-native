import type { MatchResponse } from "./types";
export type {
  MatchRequestBody,
  MatchResponse,
  Fingerprint,
  DeeplinkMatch,
  FingerprintMatch,
} from "./types";
export interface DeepLinkNowConfig {
  enableLogs?: boolean;
}
export type DeferredUserResponse = MatchResponse;
declare class DeepLinkNow {
  private apiKey;
  private config;
  private installTime;
  private log;
  private warn;
  private getFingerprint;
  private makeRequest;
  initialize(apiKey: string, config?: DeepLinkNowConfig): void;
  findDeferredUser(): Promise<MatchResponse | null>;
}
declare const _default: DeepLinkNow;
export default _default;
