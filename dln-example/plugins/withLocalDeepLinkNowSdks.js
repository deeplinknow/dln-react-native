/**
 * Example-only config plugin: builds the app against the LOCAL native SDKs in this
 * repository instead of the published ones, so the example works before
 * DeepLinkNow 1.1.0 (CocoaPods) and com.deeplinknow:dln-android 1.1.0 (Maven) are released.
 *
 *   iOS:     adds `pod 'DeepLinkNow', :path => '../../../dln-ios'` to the generated Podfile
 *            (overrides the `DeepLinkNow ~> 1.1.0` dependency of the RN podspec).
 *   Android: includes ./dln-android-local (a Gradle module that compiles the
 *            packages/dln-android sources with this app's AGP) and substitutes
 *            `com.deeplinknow:dln-android` with it in every project.
 *
 * The iOS path is relative to dln-example/ios.
 * Nothing here is needed in a real app: real apps use the published SDKs.
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withProjectBuildGradle,
  withSettingsGradle,
} = require("expo/config-plugins");

// ⬇️ SWITCH: set to false once the native SDKs are published, to use the published
//    DeepLinkNow pod / dln-android artifact pinned by @deeplinknow/react-native.
const USE_LOCAL_NATIVE_SDKS = true;

const IOS_SDK_PATH = "../../../dln-ios";
const MARKER =
  "DLN local native SDK (dln-example/plugins/withLocalDeepLinkNowSdks.js)";

const withLocalIosSdk = (config) =>
  withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfile, "utf8");
      if (!contents.includes(MARKER)) {
        // Declare the pod inside the app target, before autolinking runs.
        contents = contents.replace(
          /(target ['"][^'"]+['"] do\n)/,
          `$1  # ${MARKER}\n  pod 'DeepLinkNow', :path => '${IOS_SDK_PATH}'\n`
        );
        fs.writeFileSync(podfile, contents);
      }
      return cfg;
    },
  ]);

const withLocalAndroidSdk = (config) => {
  config = withSettingsGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `
// ${MARKER}
include ':dln-android-local'
project(':dln-android-local').projectDir = new File(rootDir, '../plugins/dln-android-local')
`;
    }
    return cfg;
  });
  return withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `
// ${MARKER}
allprojects {
  configurations.all {
    resolutionStrategy.dependencySubstitution {
      substitute(module('com.deeplinknow:dln-android')).using(project(':dln-android-local'))
    }
  }
}
`;
    }
    return cfg;
  });
};

module.exports = (config) => {
  // biome-ignore lint/suspicious/noUnnecessaryConditions: USE_LOCAL_NATIVE_SDKS is a manual switch, edited by hand once the native SDKs are published.
  if (!USE_LOCAL_NATIVE_SDKS) {
    return config;
  }
  return withLocalAndroidSdk(withLocalIosSdk(config));
};
