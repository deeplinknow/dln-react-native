import { useEffect, useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import DeepLinkNow from "react-native-deeplink-now";
import type { DeferredUserResponse } from "react-native-deeplink-now";

DeepLinkNow.initialize("test-api-key");

export default function App() {
  const [user, setUser] = useState<DeferredUserResponse | null>(null);

  useEffect(() => {
    DeepLinkNow.findDeferredUser().then((response) => {
      console.log(response);
      setUser(response);
    });
  }, []);

  return (
    <View style={styles.container}>
      <Text>Result: {JSON.stringify(user)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
