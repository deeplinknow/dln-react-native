// Mock fetch for testing
global.fetch = require('jest-fetch-mock');

// Mock native modules
jest.mock('expo-modules-core', () => {
  const actual = jest.requireActual('expo-modules-core');
  return {
    ...actual,
    requireNativeModule: jest.fn(() => ({
      initialize: jest.fn(),
      findDeferredUser: jest.fn(),
      checkClipboard: jest.fn(),
      hasDeepLinkToken: jest.fn(),
      parseDeepLink: jest.fn(),
      getClipboardString: jest.fn(),
      setClipboardString: jest.fn(),
      hasClipboardString: jest.fn(),
      processInstallReferrer: jest.fn(),
      getCachedReferrerData: jest.fn(),
      clearReferrerCache: jest.fn(),
    })),
  };
});

// Mock React Native modules
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    NativeModules: {
      ...RN.NativeModules,
      Locale: {
        getDefault: jest.fn(() => 'en-US'),
      },
      TimeZone: {
        getDefault: jest.fn(() => 'UTC'),
      },
    },
    Platform: {
      ...RN.Platform,
      OS: 'ios',
      Version: '14.0',
      select: jest.fn((obj) => obj.ios),
    },
  };
});
