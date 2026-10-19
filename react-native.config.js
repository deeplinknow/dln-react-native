/**
 * React Native CLI configuration for DeepLinkNow.
 *
 * This configuration enables autolinking for vanilla React Native projects.
 * Expo projects use expo-module.config.json instead.
 *
 * @see https://github.com/react-native-community/cli/blob/main/docs/dependencies.md
 */

/**
 * Expo apps link this package as an Expo module (expo-module.config.json). Expo's
 * autolinking also reads this file, so in an Expo app the React Native CLI entries
 * must be disabled; otherwise Android gets a second Gradle project for the same
 * sources and a `new DeepLinkNowPackage()` that the Expo flavor doesn't compile.
 * Same detection as the podspec and android/build.gradle: the app (cwd) resolves
 * expo + expo-modules-core; USE_EXPO_MODULES=1/0 overrides.
 */
function isExpoApp() {
  if (process.env.USE_EXPO_MODULES === "1") {
    return true;
  }
  if (process.env.USE_EXPO_MODULES === "0") {
    return false;
  }
  try {
    const paths = [process.cwd()];
    require.resolve("expo/package.json", { paths });
    require.resolve("expo-modules-core/package.json", { paths });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  dependency: {
    platforms: isExpoApp()
      ? { ios: null, android: null }
      : {
          ios: {
            // The podspec at the package root (the CLI finds it there; kept here for older CLIs)
            podspecPath: "./DeeplinknowReactNative.podspec",
          },
          android: {
            // Path to the Android source directory
            sourceDir: "./android",
            // Package import statement for MainApplication.java/kt
            packageImportPath:
              "import com.deeplinknow.reactnative.DeepLinkNowPackage;",
            // How to instantiate the package
            packageInstance: "new DeepLinkNowPackage()",
          },
        },
  },
};
