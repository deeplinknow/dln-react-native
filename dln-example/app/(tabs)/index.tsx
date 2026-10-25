/**
 * DeepLinkNow React Native / Expo example.
 *
 * The integration:
 *   1. app/+native-intent.tsx: createRedirectSystemPath({ apiKey }) initializes the SDK and,
 *      on the first launch after install, opens the app on the deferred deep link.
 *   2. useDeferredDeepLink(): a deferred link that arrived after the helper's timeout.
 *   3. DeepLinkNow.parseDeepLink(url): Universal Links / App Links that open the app.
 *
 * None of these throw: a failure gives null and the error is in DeepLinkNow.lastError.
 * Everything else on this screen is for testing.
 */
import DeepLinkNow, {
  type DeferredDeepLink,
  DLNError,
  getModuleType,
  type ParsedDeepLink,
  useDeepLink,
  useDeferredDeepLink,
} from "@deeplinknow/react-native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DLN_API_KEY, DLN_CONFIG } from "@/constants/deeplinknow";

// Fingerprint matches below this score are ignored. Off (undefined) by default: the SDK
// returns the best candidate and you decide using confidenceScore / matchQuality.
const MIN_CONFIDENCE_OPTIONS: (number | undefined)[] = [undefined, 30, 50, 75];

function describeError(e: unknown): string {
  if (e instanceof DLNError) {
    return `${e.code}: ${e.message}`;
  }
  return String(e);
}

export default function HomeScreen() {
  // Set by mapLink in app/+native-intent.tsx when the app was opened on a DeepLinkNow link.
  const routed = useLocalSearchParams<{ dln?: string; source?: string }>();
  // Shares the one check that +native-intent started. It also starts it where
  // +native-intent doesn't run (web), so it gets the same key and config.
  const late = useDeferredDeepLink({ apiKey: DLN_API_KEY, config: DLN_CONFIG });
  // 1.4.0: one handler for every open. With Expo Router the router handles
  // direct opens, so here it shows the deferred link (RN-38).
  const every = useDeepLink({ apiKey: DLN_API_KEY, config: DLN_CONFIG });
  const initialized = DeepLinkNow.isInitialized();
  const initError =
    !(late.isLoading || initialized) && DeepLinkNow.lastError
      ? describeError(DeepLinkNow.lastError)
      : null;

  const [minConfidence, setMinConfidence] = useState<number | undefined>(
    undefined
  );
  const [deferred, setDeferred] = useState<DeferredDeepLink | null | undefined>(
    undefined
  );
  const [deferredError, setDeferredError] = useState<string | null>(null);
  const [openedLink, setOpenedLink] = useState<ParsedDeepLink | string | null>(
    null
  );
  const [status, setStatus] = useState<string | null>(null);

  // 2: a deferred link found after +native-intent stopped waiting. A real app would
  // navigate here, e.g. after sign-in: router.push(late.link.fullPath).
  useEffect(() => {
    if (late.link) {
      setDeferred(late.link);
      late.clear();
    }
  }, [late.link]);

  const checkDeferred = useCallback(
    async (force: boolean) => {
      setDeferredError(null);
      // Returns null when there is no link, when this install has already been checked
      // (unless force is true), or on failure (then lastError says why). Never throws.
      const link = await DeepLinkNow.checkDeferredDeepLink({
        minConfidence,
        force,
      });
      setDeferred(link);
      if (!link && DeepLinkNow.lastError) {
        setDeferredError(describeError(DeepLinkNow.lastError));
      }
    },
    [minConfidence]
  );

  // 3: Universal Links / App Links that open the installed app.
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) {
        return;
      }
      // null when the URL is not on one of your app's DeepLinkNow domains.
      setOpenedLink(
        DeepLinkNow.parseDeepLink(url) ?? `Not a DeepLinkNow link: ${url}`
      );
    };
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  const reset = async () => {
    await DeepLinkNow.resetDeferredDeepLink();
    setDeferred(undefined);
    setStatus(
      "Deferred link state cleared. Tap “Check again” or relaunch the app."
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>DeepLinkNow example</Text>
        <Text style={styles.muted}>Native module: {getModuleType()}</Text>

        <Section title="1. Initialize">
          {initError ? (
            <Text style={styles.error}>Init failed: {initError}</Text>
          ) : (
            <Text>{initialized ? "Initialized" : "Initializing…"}</Text>
          )}
        </Section>

        <Section title="4. onLink (1.4.0)">
          {every.link ? (
            <View>
              <Row label="type" value={every.link.type} />
              <Row label="source" value={every.link.source} />
              <Row label="fullPath" value={every.link.fullPath} />
              <Row label="url" value={every.link.url} />
            </View>
          ) : (
            <Text>{every.isLoading ? "Waiting…" : "No link yet"}</Text>
          )}
        </Section>

        <Section title="2. Deferred deep link (first launch)">
          {routed.dln ? (
            <Text>
              Opened by +native-intent on {routed.dln} ({routed.source})
            </Text>
          ) : null}
          {deferredError ? (
            <Text style={styles.error}>{deferredError}</Text>
          ) : null}
          {deferred === undefined && !deferredError && (
            <Text>
              {late.isLoading ? "Checking…" : "Nothing beyond the launch route"}
            </Text>
          )}
          {deferred === null && <Text>No deferred deep link</Text>}
          {deferred ? (
            <View>
              <Row label="path" value={deferred.path} />
              <Row
                label="queryParams"
                value={JSON.stringify(deferred.queryParams)}
              />
              <Row label="fullPath" value={deferred.fullPath} />
              <Row label="source" value={deferred.source} />
              <Row
                label="confidenceScore"
                value={String(deferred.confidenceScore)}
              />
              <Row label="matchQuality" value={deferred.matchQuality} />
            </View>
          ) : null}

          <Text style={styles.label}>minConfidence</Text>
          <View style={styles.chips}>
            {MIN_CONFIDENCE_OPTIONS.map((value) => (
              <Pressable
                key={String(value)}
                onPress={() => setMinConfidence(value)}
                style={[
                  styles.chip,
                  value === minConfidence && styles.chipSelected,
                ]}
              >
                <Text
                  style={
                    value === minConfidence
                      ? styles.chipTextSelected
                      : undefined
                  }
                >
                  {value === undefined ? "Off" : String(value)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.buttons}>
            <Button
              disabled={!initialized}
              onPress={() => checkDeferred(true)}
              title="Check again (force)"
            />
            <Button
              disabled={!initialized}
              onPress={reset}
              title="Reset deferred link"
            />
          </View>
          {status ? <Text style={styles.muted}>{status}</Text> : null}
        </Section>

        <Section title="3. Opened by a link">
          {openedLink === null && (
            <Text>Open a link on your DeepLinkNow domain to see it here</Text>
          )}
          {typeof openedLink === "string" && <Text>{openedLink}</Text>}
          {openedLink && typeof openedLink === "object" ? (
            <View>
              <Row label="path" value={openedLink.path} />
              <Row
                label="queryParams"
                value={JSON.stringify(openedLink.queryParams)}
              />
              <Row label="fullPath" value={openedLink.fullPath} />
            </View>
          ) : null}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.row}>
      <Text style={styles.rowLabel}>{label}: </Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: "bold" },
  muted: { color: "#666" },
  error: { color: "#c00" },
  section: { backgroundColor: "white", padding: 16, borderRadius: 8, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "600" },
  row: { fontFamily: "monospace", fontSize: 13 },
  rowLabel: { fontWeight: "600" },
  label: { marginTop: 8, fontWeight: "600" },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#eee",
  },
  chipSelected: { backgroundColor: "#007AFF" },
  chipTextSelected: { color: "white" },
  buttons: { gap: 4, marginTop: 8 },
});
