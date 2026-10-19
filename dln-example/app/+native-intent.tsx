/**
 * Expo Router would otherwise try to open a screen for the path of every incoming
 * Universal Link / App Link (e.g. /products/123) and show "Unmatched route".
 * This example handles DeepLinkNow links on the home screen with
 * DeepLinkNow.parseDeepLink, so every incoming link opens "/".
 * In a real app, map the parsed path to your own routes here or on the home screen.
 */
export function redirectSystemPath(_: { path: string; initial: boolean }) {
  return "/";
}
