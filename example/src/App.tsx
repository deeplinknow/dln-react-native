import { useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  Linking,
  ScrollView,
} from "react-native";
import DeepLinkNow from "@deeplinknow/react-native";
import type { DeferredUserResponse } from "@deeplinknow/react-native";

type Match = DeferredUserResponse["matches"][0];

export default function App() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [isInitialised, setIsInitialised] = useState(false);
  const [clipboardResult, setClipboardResult] = useState<string | null>(null);

  async function initDln() {
    await DeepLinkNow.initialize("web-test-api-key", {
      enableLogs: __DEV__,
    });

    setIsInitialised(true);
  }

  async function findDeferredUser() {
    const response = await DeepLinkNow.findDeferredUser();
    console.log(JSON.stringify(response, null, 2));

    if (response?.matches) {
      setMatches(response?.matches);
    }
  }

  async function visitExternalDeeplinkPage() {
    Linking.openURL(
      "https://test-app.deeplinknow.com/sample-link?is_test=true&hello=world&otherParams=false",
    );
  }

  async function checkClipboard() {
    const result = await DeepLinkNow.checkClipboard();
    setClipboardResult(result);
  }

  return (
    <ScrollView
      style={styles.outerStyle}
      contentContainerStyle={styles.innerStyle}
    >
      <Text style={styles.header}>DeepLinkNow</Text>

      <Pressable onPress={initDln} style={styles.button}>
        <Text style={styles.buttonText}>
          {!isInitialised ? "Init DLN" : "Initialised!"}
        </Text>
      </Pressable>
      <Pressable onPress={visitExternalDeeplinkPage} style={styles.button}>
        <Text style={styles.buttonText}>Visit External Deeplink Page</Text>
      </Pressable>
      <Pressable onPress={findDeferredUser} style={styles.button}>
        <Text style={styles.buttonText}>Find Deferred User</Text>
      </Pressable>
      <Pressable onPress={checkClipboard} style={styles.button}>
        <Text style={styles.buttonText}>Check Clipboard</Text>
      </Pressable>
      {clipboardResult && (
        <Text style={styles.resultText}>
          Clipboard Result: {clipboardResult}
        </Text>
      )}

      {!!matches?.length && (
        <View>
          <Text>Match results</Text>
          {matches?.map((match, index) => <Match match={match} key={index} />)}
        </View>
      )}
    </ScrollView>
  );
}
function Match({ match }: { match: Match }) {
  return (
    <View style={styles.matchCard}>
      <View style={styles.matchHeader}>
        <Text style={styles.confidenceScore}>
          Confidence: {match.confidence_score.toFixed(1)}%
        </Text>
      </View>

      {match.deeplink && (
        <View style={styles.deeplinkSection}>
          <Text style={styles.sectionTitle}>Deeplink Info</Text>
          <Text style={styles.deeplinkUrl}>
            URL: {match.deeplink.target_url}
          </Text>
          {match.deeplink.campaign_id && (
            <Text style={styles.campaignId}>
              Campaign: {match.deeplink.campaign_id}
            </Text>
          )}
          <Text style={styles.timestamp}>
            Matched: {new Date(match.deeplink.matched_at).toLocaleString()}
          </Text>
          <Text style={styles.timestamp}>
            Expires: {new Date(match.deeplink.expires_at).toLocaleString()}
          </Text>
        </View>
      )}

      <View style={styles.matchDetailsSection}>
        <Text style={styles.sectionTitle}>Match Details</Text>
        {match.match_details && (
          <>
            <View style={styles.detailRow}>
              <Text>
                IP Match: {match.match_details.ip_match.matched ? "✓" : "✗"}
              </Text>
              <Text>
                Weight: {match.match_details.ip_match.score.toFixed(0)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text>
                Device Match:{" "}
                {match.match_details.device_match.matched ? "✓" : "✗"}
              </Text>
              <Text>
                Weight: {match.match_details.device_match.score.toFixed(0)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text>
                Locale Match:{" "}
                {match.match_details.locale_match.matched ? "✓" : "✗"}
              </Text>
              <Text>
                Weight: {match.match_details.locale_match.score.toFixed(0)}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerStyle: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  innerStyle: {
    justifyContent: "flex-start",
    alignItems: "stretch",
    padding: 20,
    paddingTop: 60,
  },

  header: {
    marginBottom: 20,
    fontSize: 30,
    fontWeight: "bold",
  },
  button: {
    width: "100%",
    marginTop: 20,
    padding: 10,
    backgroundColor: "blue",
    color: "white",
    borderRadius: 5,
  },
  buttonText: {
    color: "white",
  },
  resultText: {
    marginTop: 20,
    width: "100%",
  },
  matchCard: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 16,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    width: "100%",
  },
  matchHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 8,
    marginBottom: 12,
  },
  confidenceScore: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2196F3",
  },
  deeplinkSection: {
    marginBottom: 16,
  },
  matchDetailsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#333",
  },
  deeplinkUrl: {
    fontSize: 14,
    color: "#2196F3",
    marginBottom: 4,
  },
  campaignId: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
});
