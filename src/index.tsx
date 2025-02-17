import { Platform, NativeModules } from 'react-native';
import type { MatchRequestBody, MatchResponse, Fingerprint } from './types';

// Export all types that consumers might need
export type {
  MatchRequestBody,
  MatchResponse,
  Fingerprint,
  DeeplinkMatch,
  FingerprintMatch,
} from './types';

export interface DeepLinkNowConfig {
  enableLogs?: boolean;
}

export type DeferredUserResponse = MatchResponse;

class DeepLinkNow {
  private apiKey: string | null = null;
  private config: DeepLinkNowConfig = {
    enableLogs: false,
  };
  private installTime: string = new Date().toISOString();

  private log(...args: any[]) {
    if (this.config.enableLogs) {
      console.log('[DeepLinkNow]', ...args);
    }
  }

  private warn(...args: any[]) {
    console.warn('[DeepLinkNow]', ...args);
  }

  private async getFingerprint(): Promise<Omit<Fingerprint, 'ip_address'>> {
    const deviceModel = Platform.select({
      ios: NativeModules.DeviceInfo?.deviceName || 'unknown',
      android: NativeModules.DeviceInfo?.model || 'unknown',
    });

    return {
      user_agent: `DeepLinkNow-ReactNative/${Platform.OS}`,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      os_version: String(Platform.Version),
      device_model: deviceModel,
      language: Intl.DateTimeFormat().resolvedOptions().locale || 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      installed_at: this.installTime,
      last_opened_at: new Date().toISOString(),
      device_id: null,
      advertising_id: null,
      vendor_id: null,
      hardware_fingerprint: null,
    };
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T | null> {
    if (!this.apiKey) {
      this.warn('SDK not initialized. Call initialize() first');
      return null;
    }

    try {
      const response = await fetch(
        `https://deeplinknow.com/api/v1/sdk/${endpoint}`,
        {
          ...options,
          headers: {
            ...options.headers,
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        this.warn(`API request failed: ${response.status}`, data);
        return null;
      }

      return data as T;
    } catch (error) {
      this.warn('API request failed:', error);
      return null;
    }
  }

  initialize(apiKey: string, config?: DeepLinkNowConfig) {
    if (!apiKey || typeof apiKey !== 'string') {
      this.warn('Invalid API key provided');
      return;
    }

    this.apiKey = apiKey;
    this.config = {
      ...this.config,
      ...config,
    };

    this.log('Initialized with config:', this.config);
  }

  async findDeferredUser(): Promise<MatchResponse | null> {
    this.log('Finding deferred user...');

    const fingerprint = await this.getFingerprint();

    const matchRequest: MatchRequestBody = {
      fingerprint,
    };

    this.log('Sending match request:', matchRequest);

    const response = await this.makeRequest<MatchResponse>('match', {
      method: 'POST',
      body: JSON.stringify(matchRequest),
    });

    if (response) {
      this.log('Match response:', response);
    }

    return response;
  }
}

export default new DeepLinkNow();
