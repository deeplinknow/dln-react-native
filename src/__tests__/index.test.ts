import DeepLinkNow from "../index";
import fetchMock from "jest-fetch-mock";

// Mock NativeModules since we're in a test environment
jest.mock("react-native", () => ({
  Platform: {
    OS: "ios",
    Version: "16.0",
    select: jest.fn((obj) => obj.ios),
  },
  NativeModules: {
    Locale: {
      getDefault: jest.fn(() => "en-US"),
    },
    TimeZone: {
      getDefault: jest.fn(() => "America/Los_Angeles"),
    },
    DeviceInfo: {
      deviceName: "iPhone Test",
    },
  },
}));

describe("DeepLinkNow Tests", () => {
  const testApiKey = "test-api-key";
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    fetchMock.resetMocks();
    // Silence console warnings during tests
    console.warn = jest.fn();
    // Reset the state of the DeepLinkNow instance before each test
    DeepLinkNow.initialize(testApiKey);
  });

  afterEach(() => {
    // Restore console.warn after tests
    console.warn = originalConsoleWarn;
  });

  describe("Initialization Tests", () => {
    it("should initialize successfully", async () => {
      const mockInitResponse = {
        app: {
          id: "test_app_id",
          name: "Test App",
          timezone: "UTC",
          android_package_name: null,
          android_sha256_cert: null,
          ios_bundle_id: "com.test.app",
          ios_app_store_id: "123456789",
          ios_app_prefix: "test",
          custom_domains: [
            {
              domain: "test.com",
              verified: true,
            },
          ],
        },
        account: {
          status: "active",
          credits_remaining: 1000,
          rate_limits: {
            matches_per_second: 10,
            matches_per_day: 1000,
          },
        },
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockInitResponse));

      await DeepLinkNow.initialize(testApiKey);

      expect(DeepLinkNow.isValidDomain("test.com")).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledWith(
        "https://deeplinknow.com/api/v1/sdk/init",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-api-key": testApiKey,
          }),
        }),
      );
    });
  });

  describe("Fingerprint Tests", () => {
    it("should generate fingerprint correctly", async () => {
      const mockInitResponse = {
        app: {
          id: "test_app_id",
          name: "Test App",
          timezone: "UTC",
          custom_domains: [],
        },
        account: {
          status: "active",
          credits_remaining: 1000,
          rate_limits: {
            matches_per_second: 10,
            matches_per_day: 1000,
          },
        },
      };

      const mockMatchResponse = {
        matches: [
          {
            confidence_score: 0.95,
            match_details: {
              ip_match: { matched: true, score: 1 },
              device_match: {
                matched: true,
                score: 1,
                components: {
                  platform: true,
                  os_version: true,
                  device_model: true,
                  hardware_fingerprint: true,
                },
              },
              time_proximity: {
                score: 1,
                time_difference_minutes: 0,
              },
              locale_match: {
                matched: true,
                score: 1,
                components: {
                  language: true,
                  timezone: true,
                },
              },
            },
            deeplink: {
              id: "test_id",
              target_url: "https://example.com",
              metadata: {
                campaign: "test_campaign",
              },
              campaign_id: "campaign_123",
              matched_at: "2024-01-01T00:00:00+00:00",
              expires_at: "2024-01-02T00:00:00+00:00",
            },
          },
        ],
        ttl_seconds: 86400,
      };

      fetchMock
        .mockResponseOnce(JSON.stringify(mockInitResponse))
        .mockResponseOnce(JSON.stringify(mockMatchResponse));

      await DeepLinkNow.initialize(testApiKey);
      const result = await DeepLinkNow.findDeferredUser();

      expect(result).toBeDefined();
      expect(result?.matches?.[0]?.confidence_score).toBe(0.95);
      expect(
        result?.matches?.[0]?.match_details?.ip_match?.matched,
      ).toBeTruthy();
      expect(
        result?.matches?.[0]?.match_details?.device_match?.matched,
      ).toBeTruthy();
      expect(result?.matches?.[0]?.match_details?.time_proximity?.score).toBe(
        1,
      );
      expect(
        result?.matches?.[0]?.match_details?.locale_match?.matched,
      ).toBeTruthy();
      expect(result?.matches?.[0]?.deeplink?.id).toBe("test_id");
      expect(result?.matches?.[0]?.deeplink?.target_url).toBe(
        "https://example.com",
      );
      expect(result?.matches?.[0]?.deeplink?.metadata?.campaign).toBe(
        "test_campaign",
      );
      expect(result?.matches?.[0]?.deeplink?.campaign_id).toBe("campaign_123");
      expect(result?.matches?.[0]?.deeplink?.matched_at).toBe(
        "2024-01-01T00:00:00+00:00",
      );
      expect(result?.matches?.[0]?.deeplink?.expires_at).toBe(
        "2024-01-02T00:00:00+00:00",
      );
      expect(result?.ttl_seconds).toBe(86400);
    });
  });

  describe("Deep Link Tests", () => {
    it("should validate domains correctly", async () => {
      const mockInitResponse = {
        app: {
          id: "test_app_id",
          name: "Test App",
          timezone: "UTC",
          custom_domains: [],
        },
        account: {
          status: "active",
          credits_remaining: 1000,
          rate_limits: {
            matches_per_second: 10,
            matches_per_day: 1000,
          },
        },
      };

      fetchMock.mockResponseOnce(JSON.stringify(mockInitResponse));

      await DeepLinkNow.initialize(testApiKey);

      expect(DeepLinkNow.isValidDomain("deeplinknow.com")).toBeTruthy();
      expect(DeepLinkNow.isValidDomain("deeplink.now")).toBeTruthy();
      expect(DeepLinkNow.isValidDomain("invalid.com")).toBeFalsy();
    });

    it("should parse deep links correctly", async () => {
      await DeepLinkNow.initialize(testApiKey);
      const url =
        "https://deeplinknow.com/test/path?param1=value1&param2=value2";
      const result = DeepLinkNow.parseDeepLink(url);

      expect(result).toBeDefined();
      expect(result?.path).toBe("/test/path");
      expect(result?.parameters).toEqual({
        param1: "value1",
        param2: "value2",
      });
    });
  });

  describe("Match Response Tests", () => {
    it("should find deferred user correctly", async () => {
      const mockInitResponse = {
        app: {
          id: "test_app_id",
          name: "Test App",
          timezone: "UTC",
          custom_domains: [],
        },
        account: {
          status: "active",
          credits_remaining: 1000,
          rate_limits: {
            matches_per_second: 10,
            matches_per_day: 1000,
          },
        },
      };

      const mockMatchResponse = {
        matches: [
          {
            confidence_score: 0.95,
            match_details: {
              ip_match: { matched: true, score: 1 },
              device_match: {
                matched: true,
                score: 1,
                components: {
                  platform: true,
                  os_version: true,
                  device_model: true,
                  hardware_fingerprint: true,
                },
              },
              time_proximity: {
                score: 1,
                time_difference_minutes: 0,
              },
              locale_match: {
                matched: true,
                score: 1,
                components: {
                  language: true,
                  timezone: true,
                },
              },
            },
            deeplink: {
              id: "test_id",
              target_url: "https://example.com",
              metadata: {
                campaign: "test_campaign",
              },
              campaign_id: "campaign_123",
              matched_at: "2024-01-01T00:00:00+00:00",
              expires_at: "2024-01-02T00:00:00+00:00",
            },
          },
        ],
        ttl_seconds: 86400,
      };

      fetchMock
        .mockResponseOnce(JSON.stringify(mockInitResponse))
        .mockResponseOnce(JSON.stringify(mockMatchResponse));

      await DeepLinkNow.initialize(testApiKey);
      const result = await DeepLinkNow.findDeferredUser();

      expect(result).toBeDefined();
      expect(result?.matches?.[0]?.confidence_score).toBe(0.95);
      expect(
        result?.matches?.[0]?.match_details?.ip_match?.matched,
      ).toBeTruthy();
      expect(
        result?.matches?.[0]?.match_details?.device_match?.matched,
      ).toBeTruthy();
      expect(result?.matches?.[0]?.match_details?.time_proximity?.score).toBe(
        1,
      );
      expect(
        result?.matches?.[0]?.match_details?.locale_match?.matched,
      ).toBeTruthy();
      expect(result?.matches?.[0]?.deeplink?.id).toBe("test_id");
      expect(result?.matches?.[0]?.deeplink?.target_url).toBe(
        "https://example.com",
      );
      expect(result?.matches?.[0]?.deeplink?.metadata?.campaign).toBe(
        "test_campaign",
      );
      expect(result?.matches?.[0]?.deeplink?.campaign_id).toBe("campaign_123");
      expect(result?.matches?.[0]?.deeplink?.matched_at).toBe(
        "2024-01-01T00:00:00+00:00",
      );
      expect(result?.matches?.[0]?.deeplink?.expires_at).toBe(
        "2024-01-02T00:00:00+00:00",
      );
      expect(result?.ttl_seconds).toBe(86400);
    });
  });
});
