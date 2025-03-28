import DeepLinkNow from "@deeplinknow/react-native";

export const DLN = async () => {
  await DeepLinkNow.initialize("test_api_key", {
    enableLogs: __DEV__,
  });
};
