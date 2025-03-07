# react-native-deeplink-now

React Native SDK for DeepLink Now - handle deferred deep linking in your React Native app.

## Installation

```sh
npm install react-native-deeplink-now
```

## Usage

```typescript
import DeepLinkNow from "react-native-deeplink-now";

// Initialize the SDK
await DeepLinkNow.initialize("your-api-key", {
  enableLogs: true, // Optional: Enable verbose logging
});

// Find deferred user
const findUser = async () => {
  const match = await DeepLinkNow.findDeferredUser();
  if (match) {
    console.log("Found match:", match);
  }
};

// Parse deep links
const parseLink = (url: string) => {
  const result = DeepLinkNow.parseDeepLink(url);
  if (result) {
    console.log("Path:", result.path);
    console.log("Parameters:", result.parameters);
  }
};
```

## API Reference

### initialize(apiKey: string, config?: DeepLinkNowConfig)

Initializes the SDK with your API key and optional configuration.

Parameters:

- `apiKey`: Your DeepLink Now API key
- `config`: Optional configuration object
  - `enableLogs`: Enable verbose logging (default: false)
  - `customDomain`: Custom domain for API requests

### findDeferredUser(): Promise<MatchResponse | null>

Attempts to find a deferred deep link match.

Returns:

```typescript
{
  match: {
    deeplink?: {
      id: string;
      target_url: string;
      metadata: Record<string, any>;
      campaign_id?: string;
      matched_at: string;
      expires_at: string;
    };
    confidence_score: number;
    ttl_seconds: number;
  }
}
```

### parseDeepLink(url: string): { path: string; parameters: Record<string, string> } | null

Parses a deep link URL if it's from a valid domain.

Valid domains include:

- deeplinknow.com
- deeplink.now
- Your app's verified custom domains

## Error Handling

The SDK uses a graceful error handling approach:

- Invalid API keys or initialization issues will log warnings
- Network requests that fail will return null and log warnings
- Enable verbose logging to see detailed information

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
