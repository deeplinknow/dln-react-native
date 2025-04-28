import { Platform } from "react-native";

// Define a type for the clipboard module shapes
type ClipboardModuleType =
  | {
      getStringAsync: () => Promise<string>;
      setStringAsync: (text: string) => Promise<void>;
    }
  | {
      getString: () => Promise<string>;
      setString: (text: string) => void;
    };

let clipboardModule: ClipboardModuleType | undefined;
let IS_EXPO = false;
try {
  // Try to use expo-clipboard if available
  clipboardModule = require("expo-clipboard");
  IS_EXPO = true;
} catch (error) {
  // Fall back to react-native-clipboard if expo isn't available
  // Check if running on web, clipboard is not supported there for @react-native-clipboard/clipboard
  if (Platform.OS !== "web") {
    clipboardModule = require("@react-native-clipboard/clipboard");
  } else {
    console.warn("Clipboard is not supported on web without Expo.");
    // Provide a mock or dummy implementation for web if needed
    clipboardModule = {
      getString: async () => "",
      setString: () => {},
    };
  }
  IS_EXPO = false;
}

const Clipboard = {
  getString: async (): Promise<string> => {
    if (!clipboardModule) return ""; // Handle case where no module is loaded (e.g., web without Expo)
    if (IS_EXPO && "getStringAsync" in clipboardModule) {
      return await clipboardModule.getStringAsync();
    } else if (!IS_EXPO && "getString" in clipboardModule) {
      return await clipboardModule.getString();
    }
    // Should not happen if logic is correct, but provides a fallback
    console.error("Clipboard module method mismatch in getString.");
    return "";
  },
  setString: async (text: string): Promise<void> => {
    if (!clipboardModule) return; // Handle case where no module is loaded
    if (IS_EXPO && "setStringAsync" in clipboardModule) {
      await clipboardModule.setStringAsync(text);
    } else if (!IS_EXPO && "setString" in clipboardModule) {
      clipboardModule.setString(text);
    } else {
      // Should not happen
      console.error("Clipboard module method mismatch in setString.");
    }
  },
};
export { Clipboard };
