import { useColorScheme as useNativeColorScheme } from "react-native";

/** Native color scheme; `use-color-scheme.web.ts` is the web variant. */
export function useColorScheme() {
  return useNativeColorScheme();
}
