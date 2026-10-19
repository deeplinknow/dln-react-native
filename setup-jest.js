// Each test loads a fresh SDK with its own native-module and react-native mocks
// (see src/__tests__/support/helpers.ts). Here we only provide a fetch stub so
// an unexpected network call fails loudly instead of hitting the internet.
global.fetch = jest.fn(async (url) => {
  throw new Error(`Unexpected fetch in test: ${url}`);
});
