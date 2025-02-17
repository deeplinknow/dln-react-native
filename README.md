# react-native-deeplink-now

React Native SDK for DeepLink Now - handle deferred deep linking in your React Native app.

## Installation

```sh
npm install react-native-deeplink-now
```

## Usage

```javascript
import DeepLinkNow from 'react-native-deeplink-now';

// Initialize the SDK
DeepLinkNow.initialize('your-api-key', {
  enableLogs: true, // Optional: Enable verbose logging
});

// Find deferred user
const findUser = async () => {
  const user = await DeepLinkNow.findDeferredUser();
  if (user) {
    console.log('Found deferred user:', user);
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

### findDeferredUser(): Promise<MatchResponse | null>

Attempts to find a deferred deep link by making an API request to the matching endpoint.

Returns a Promise that resolves to:

- A MatchResponse object containing:
  - `match.deeplink`: The matched deep link information (if found)
  - `match.confidence_score`: Confidence score of the match
  - `match.ttl_seconds`: Time-to-live in seconds for this match
- `null` if no match is found or an error occurs

Example response:

```typescript
{
  match: {
    deeplink: {
      id: "uuid",
      target_url: "https://example.com/path",
      metadata: { /* custom metadata */ },
      campaign_id: "uuid",
      matched_at: "2024-03-14T12:00:00Z",
      expires_at: "2024-03-14T13:00:00Z"
    },
    confidence_score: 0.95,
    ttl_seconds: 3600
  }
}
```

## Error Handling

The SDK uses a graceful error handling approach:

- Invalid API keys or initialization issues will log warnings but won't throw errors
- Network requests that fail will return null and log warnings
- Enable verbose logging to see detailed information about SDK operations

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
