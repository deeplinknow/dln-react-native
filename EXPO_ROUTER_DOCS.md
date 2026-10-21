<!--
Proposed text for web/content/docs/react-native-docs.md (RM-20, RN-26…RN-32).
Merge note: insert the section below between "### The result: `DeferredDeepLink`" and
"## How fingerprint matching works", and add one line to the end of "### Get the deferred
deep link": "Using Expo Router? See [Expo Router](#expo-router)." Ships with the next
shared SDK minor (SDK-84); publish the page change only after that npm release.
Delete this file after merging.
-->

## Expo Router

If your app uses Expo Router, get the deferred deep link in `app/+native-intent.tsx`. Expo Router calls this file with the URL that launched the app, before the first screen mounts. Resolving the link there means the app opens straight on the screen the user tapped: the home screen doesn't flash first, and your layouts' redirects (an auth gate, onboarding) see the right route from the start.

Create `app/+native-intent.tsx`:

```tsx
import { createRedirectSystemPath } from "@deeplinknow/react-native/expo-router";

export const redirectSystemPath = createRedirectSystemPath({
  apiKey: "YOUR_API_KEY",
});
```

That's the whole integration. You don't need to call `DeepLinkNow.initialize` anywhere else: the helper does it.

What happens on each launch:

| The app was opened… | The helper returns |
|---|---|
| for the first time after install, from the store or the home screen | The link the user tapped before installing, e.g. `/products/123?ref=newsletter`. If there is none, or the check takes longer than `timeoutMs`, the app starts on its normal route |
| by a link on your DeepLinkNow domains (`yourapp.deeplinknow.com` or a verified custom domain) | That link's path and query, e.g. `/products/123?ref=newsletter` |
| any other way (a later launch, another URL, your own `myapp://` links) | The URL unchanged, so Expo Router handles it as usual |

The helper never throws. If something fails (offline, a wrong API key), the app starts where it would have without DeepLinkNow, and `DeepLinkNow.lastError` says why.

### Options

| Option | Default | Description |
|---|---|---|
| `apiKey` | required | Your API key |
| `config` | `{}` | Passed to `initialize`: `enableLogs`, `baseUrl`, `timeoutMs`, `retryAttempts` |
| `minConfidence` | off | Ignore fingerprint matches scoring below this (0–100). See [How fingerprint matching works](#how-fingerprint-matching-works) |
| `useClipboard` | `true` | iOS: check the link the landing page copied first |
| `timeoutMs` | `3000` | The longest the first launch waits for the link, in milliseconds. `0` never waits |
| `mapUniversalLinks` | `true` | Rewrite links on your DeepLinkNow domains to their in-app path |
| `mapLink` | the link's `fullPath` | `(link, source) => string \| null`. Use it when your screen paths differ from your link paths. `source` is `"deferred"` or `"universal"`. Return `null` to keep the incoming URL |

For example, if your links look like `/p/123` but the screen is `app/products/[id].tsx`:

```tsx
export const redirectSystemPath = createRedirectSystemPath({
  apiKey: "YOUR_API_KEY",
  minConfidence: 50,
  mapLink: (link) =>
    link.path.startsWith("/p/") ? `/products/${link.path.slice(3)}` : link.fullPath,
});
```

If you already have a `redirectSystemPath` with your own rewrites, call `redirectSystemPathWithDeferredLink(event, options)` from it and apply your rewrites to the result.

### Open the link after sign-in

If a deep-linked screen needs a signed-in user, take the link from `useDeferredDeepLink()` instead and navigate once the user has signed in. Set `timeoutMs: 0` in `+native-intent.tsx` so the app starts immediately, and handle the link in your root layout:

```tsx
// app/_layout.tsx
import { useDeferredDeepLink } from "@deeplinknow/react-native";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";

export default function RootLayout() {
  const { link, clear } = useDeferredDeepLink();
  const { isSignedIn } = useAuth(); // your auth
  const router = useRouter();

  useEffect(() => {
    if (link && isSignedIn) {
      clear(); // so it opens once
      router.push(link.fullPath);
    }
  }, [link, isSignedIn]);

  return <Stack />;
}
```

`useDeferredDeepLink()` shares the helper's check, so the network calls run once. It also delivers a link that arrived after `timeoutMs` on a slow connection. A link the helper already opened comes back as `null`.

### Without Expo Router

`useDeferredDeepLink()` works in any React Native app. Pass your API key, and it initializes the SDK and checks once:

```tsx
import { useDeferredDeepLink } from "@deeplinknow/react-native";

function App() {
  const { link, isLoading, clear } = useDeferredDeepLink({ apiKey: "YOUR_API_KEY" });

  useEffect(() => {
    if (link) {
      clear();
      navigation.navigate("Product", { path: link.path, params: link.queryParams });
    }
  }, [link]);

  // …
}
```

It returns `{ link, isLoading, clear }`. `link` is `null` until a link is found, after `clear()`, and on every launch after the first.
