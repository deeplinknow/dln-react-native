import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import DeepLinkNow from "@deeplinknow/react-native";
DeepLinkNow.initialize("test-api-key");
export default function App() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    DeepLinkNow.findDeferredUser().then((response) => {
      console.log(response);
      setUser(response);
    });
  }, []);
  return _jsx(View, {
    style: styles.container,
    children: _jsxs(Text, { children: ["Result: ", JSON.stringify(user)] }),
  });
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
