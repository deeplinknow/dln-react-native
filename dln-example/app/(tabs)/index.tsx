import DeepLinkNow from "@deeplinknow/react-native";
import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Button,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function App() {
  const [initialized, setInitialized] = useState(false);
  const [matchResult, setMatchResult] = useState<any>(null);
  const [clipboardContent, setClipboardContent] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<any>(null);

  const apiKey = "web-test-api-key"; // Replace with your actual API key for testing

  const handleInitialize = async () => {
    try {
      await DeepLinkNow.initialize(apiKey, { enableLogs: true });
      setInitialized(true);
      Alert.alert("Success", "DeepLinkNow initialized!");
    } catch (error) {
      Alert.alert("Error", `Failed to initialize: ${error}`);
    }
  };

  const handleFindDeferredUser = async () => {
    try {
      const result = await DeepLinkNow.findDeferredUser();
      setMatchResult(result);
      Alert.alert("Match Result", JSON.stringify(result, null, 2));
    } catch (error) {
      Alert.alert("Error", `Failed to find deferred user: ${error}`);
    }
  };

  const handleCheckClipboard = async () => {
    try {
      const content = await DeepLinkNow.checkClipboard();
      setClipboardContent(content);
      Alert.alert("Clipboard", content || "No deep link found in clipboard");
    } catch (error) {
      Alert.alert("Error", `Failed to check clipboard: ${error}`);
    }
  };

  const handleParseDeepLink = () => {
    const testUrl =
      "https://test-app.deeplinknow.com/products/123?utm_source=email";
    const result = DeepLinkNow.parseDeepLink(testUrl);
    setParseResult(result);
    Alert.alert("Parse Result", JSON.stringify(result, null, 2));
  };

  const handleCheckDeferredDeepLink = async () => {
    try {
      const result = await DeepLinkNow.checkDeferredDeepLink();
      Alert.alert(
        "Deferred Deep Link (Android)",
        JSON.stringify(result, null, 2),
      );
    } catch (error) {
      Alert.alert("Error", `Failed to check deferred deep link: ${error}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>DeepLinkNow SDK Test</Text>
          <Text style={styles.subtitle}>
            Status: {initialized ? "✅ Initialized" : "⚠️ Not initialized"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Initialize SDK</Text>
          <Button
            title="Initialize DeepLinkNow"
            onPress={handleInitialize}
            disabled={initialized}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Clipboard Operations</Text>
          <Button
            title="Check Clipboard"
            onPress={handleCheckClipboard}
            disabled={!initialized}
          />
          {clipboardContent && (
            <Text style={styles.result}>Clipboard: {clipboardContent}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Parse Deep Link</Text>
          <Button
            title="Parse Test URL"
            onPress={handleParseDeepLink}
            disabled={!initialized}
          />
          {parseResult && (
            <Text style={styles.result}>
              Path: {parseResult.path}
              {"\n"}
              Params: {JSON.stringify(parseResult.parameters, null, 2)}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Find Deferred User</Text>
          <Button
            title="Find Deferred User (Fingerprint Match)"
            onPress={handleFindDeferredUser}
            disabled={!initialized}
          />
          {matchResult && (
            <Text style={styles.result}>
              Matches: {matchResult.matches?.length || 0}
              {"\n"}
              TTL: {matchResult.ttl_seconds}s
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Android Install Referrer</Text>
          <Button
            title="Check Deferred Deep Link (Android Only)"
            onPress={handleCheckDeferredDeepLink}
            disabled={!initialized}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            💡 Tip: Initialize first, then test other features
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: "#007AFF",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "white",
  },
  section: {
    backgroundColor: "white",
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 12,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: "#333",
  },
  result: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    fontFamily: "monospace",
    fontSize: 12,
  },
  footer: {
    padding: 20,
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
});
