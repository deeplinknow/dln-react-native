/**
 * Static and harness checks on the native build configuration and glue code.
 * The real compile checks (Gradle/Xcode) are run separately; these guard against regressions.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const pkg = JSON.parse(read("package.json"));

const SPEC = read("src/specs/NativeDeepLinkNow.ts");
const SPEC_METHODS = [...SPEC.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]);

const FILES = {
  iosExpo: "ios/DeeplinknowReactNativeModule.swift",
  iosTurbo: "ios/DeepLinkNowTurbo.mm",
  iosCore: "ios/shared/DeepLinkNowCore.swift",
  androidExpo:
    "android/src/main/java/expo/modules/deeplinknowreactnative/DeeplinknowReactNativeModule.kt",
  androidNew:
    "android/src/newarch/java/com/deeplinknow/reactnative/DeepLinkNowModule.kt",
  androidOld:
    "android/src/oldarch/java/com/deeplinknow/reactnative/DeepLinkNowModule.kt",
  podspec: "DeeplinknowReactNative.podspec",
  gradle: "android/build.gradle",
};

function hasRuby() {
  try {
    execFileSync("ruby", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Evaluates the real podspec with a stubbed `Pod` module and returns the spec attributes. */
function evalPodspec(opts: {
  installationRoot: string;
  env?: Record<string, string>;
  withInstallModulesDependencies?: boolean;
}) {
  const harness = `
require 'json'
module Pod
  class Config
    def self.instance; @instance ||= new; end
    def installation_root; Pathname.new(ENV['DLN_TEST_INSTALL_ROOT']); end
  end
  class Spec
    attr_accessor :name, :version, :summary, :description, :license, :author, :homepage,
      :platforms, :swift_version, :source, :static_framework, :source_files,
      :pod_target_xcconfig, :compiler_flags
    attr_reader :deps
    def initialize; @deps = {}; yield self; $spec = self; end
    def dependency(name, *req); @deps[name] = req; end
  end
end
require 'pathname'
${
  opts.withInstallModulesDependencies
    ? `def install_modules_dependencies(s)
  cfg = s.pod_target_xcconfig || {}
  if ENV['RCT_NEW_ARCH_ENABLED'] == '1'
    cfg['OTHER_CPLUSPLUSFLAGS'] = "#{cfg['OTHER_CPLUSPLUSFLAGS']} -DRCT_NEW_ARCH_ENABLED=1".strip
  end
  s.pod_target_xcconfig = cfg
  s.dependency 'React-Codegen'
end`
    : ""
}
$stdout = StringIO.new
# Evaluate the podspec the way CocoaPods does (Pod._eval_podspec: eval inside a method of
# module Pod), so top-level \`def\`s in the podspec fail here exactly as they do in pod install.
module Pod
  def self._eval_podspec(string, path); eval(string, nil, path); end
end
Pod._eval_podspec(File.read(ARGV[0]), ARGV[0])
out = $stdout.string
$stdout = STDOUT
puts JSON.generate({
  source_files: Array($spec.source_files),
  xcconfig: $spec.pod_target_xcconfig || {},
  deps: $spec.deps,
  platforms: $spec.platforms,
  log: out
})
`;
  const dir = mkdtempSync(join(tmpdir(), "dln-podspec-"));
  const harnessPath = join(dir, "harness.rb");
  writeFileSync(harnessPath, `require 'stringio'\n${harness}`);
  const out = execFileSync("ruby", [harnessPath, join(ROOT, FILES.podspec)], {
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      DLN_TEST_INSTALL_ROOT: opts.installationRoot,
      ...(opts.env ?? {}),
    },
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").pop()!);
}

function makeApp(kind: "expo" | "bare") {
  const app = mkdtempSync(join(tmpdir(), `dln-${kind}-app-`));
  mkdirSync(join(app, "ios"));
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app" }));
  const nm = join(app, "node_modules");
  mkdirSync(nm);
  const addPkg = (name: string) => {
    mkdirSync(join(nm, name), { recursive: true });
    writeFileSync(
      join(nm, name, "package.json"),
      JSON.stringify({ name, version: "1.0.0", main: "index.js" })
    );
    writeFileSync(join(nm, name, "index.js"), "");
  };
  addPkg("react-native");
  if (kind === "expo") {
    addPkg("expo");
    addPkg("expo-modules-core");
  }
  return join(app, "ios");
}

const describeRuby = hasRuby() ? describe : describe.skip;

describeRuby("RN-19: podspec flavor selection (evaluated with Ruby)", () => {
  it("RN-19: in an Expo app (detected from the app's node_modules) the Expo module is compiled", () => {
    const res = evalPodspec({ installationRoot: makeApp("expo") });
    expect(res.source_files).toEqual(
      expect.arrayContaining(["ios/DeeplinknowReactNativeModule.swift"])
    );
    expect(res.source_files.join(" ")).not.toContain("DeepLinkNowTurbo");
    expect(Object.keys(res.deps)).toContain("ExpoModulesCore");
  });

  it("RN-19: in a bare app the Turbo/bridge module is compiled", () => {
    const res = evalPodspec({
      installationRoot: makeApp("bare"),
      withInstallModulesDependencies: true,
    });
    expect(res.source_files.join(" ")).toContain("DeepLinkNowTurbo");
    expect(res.source_files).not.toContain(
      "ios/DeeplinknowReactNativeModule.swift"
    );
    expect(Object.keys(res.deps)).not.toContain("ExpoModulesCore");
  });

  it("RN-19: USE_EXPO_MODULES=0/1 overrides detection", () => {
    const expo = evalPodspec({
      installationRoot: makeApp("bare"),
      env: { USE_EXPO_MODULES: "1" },
    });
    expect(expo.source_files).toContain(
      "ios/DeeplinknowReactNativeModule.swift"
    );
    const bare = evalPodspec({
      installationRoot: makeApp("expo"),
      env: { USE_EXPO_MODULES: "0" },
    });
    expect(bare.source_files.join(" ")).toContain("DeepLinkNowTurbo");
  });

  it("RN-19: on the old architecture the podspec does not force -DRCT_NEW_ARCH_ENABLED", () => {
    for (const withIMD of [true, false]) {
      const res = evalPodspec({
        installationRoot: makeApp("bare"),
        env: { RCT_NEW_ARCH_ENABLED: "0" },
        withInstallModulesDependencies: withIMD,
      });
      expect(JSON.stringify(res.xcconfig)).not.toContain(
        "RCT_NEW_ARCH_ENABLED"
      );
    }
  });

  it("RN-19: on the new architecture without install_modules_dependencies (very old RN) the flag is set explicitly", () => {
    const res = evalPodspec({
      installationRoot: makeApp("bare"),
      env: { RCT_NEW_ARCH_ENABLED: "1" },
      withInstallModulesDependencies: false,
    });
    expect(JSON.stringify(res.xcconfig)).toContain("RCT_NEW_ARCH_ENABLED");
  });

  it("RN-22 / RN-05: iOS deployment target 13.0 and the native DeepLinkNow pod pinned from package.json", () => {
    const res = evalPodspec({ installationRoot: makeApp("bare") });
    expect(res.platforms).toEqual({ ios: "13.0" });
    expect(res.deps.DeepLinkNow).toEqual([
      `~> ${pkg.deeplinknow.iosSdkVersion}`,
    ]);
  });

  it("SDK-61: the podspec links no AdSupport / AppTrackingTransparency", () => {
    expect(read(FILES.podspec)).not.toMatch(
      /AdSupport|AppTrackingTransparency/
    );
  });
});

describe("RN-19 (static): podspec", () => {
  it("RN-19: Expo detection uses the app's installation root, not package-relative node_modules paths", () => {
    const src = read(FILES.podspec);
    expect(src).toContain("installation_root");
    expect(src).not.toMatch(
      /__dir__,\s*'\.\.',\s*'\.\.',\s*'\.\.',\s*'node_modules'/
    );
    expect(src).not.toMatch(
      /'OTHER_CPLUSPLUSFLAGS'\s*=>\s*'-DRCT_NEW_ARCH_ENABLED'/
    );
  });
});

describe("RN-05: native SDK versions", () => {
  it("RN-05: package.json declares the native SDK versions and both build files read them from there", () => {
    expect(pkg.deeplinknow?.iosSdkVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.deeplinknow?.androidSdkVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(read(FILES.podspec)).toMatch(
      /package\['deeplinknow'\]\['iosSdkVersion'\]/
    );
    expect(read(FILES.gradle)).toMatch(/androidSdkVersion/);
    expect(read(FILES.gradle)).toMatch(
      /com\.deeplinknow:dln-android:\$\{?dlnAndroidVersion/
    );
  });

  it("RN-05: the pinned native versions are the minors that ship checkDeferredDeepLink (>= 1.1.0)", () => {
    const ge = (v: string, min: string) => {
      const a = v.split(".").map(Number);
      const b = min.split(".").map(Number);
      for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) {
          return a[i] > b[i];
        }
      }
      return true;
    };
    expect(ge(pkg.deeplinknow.iosSdkVersion, "1.1.0")).toBe(true);
    expect(ge(pkg.deeplinknow.androidSdkVersion, "1.1.0")).toBe(true);
  });
});

describe("RN-21: Android codegen on the new architecture", () => {
  const gradle = read(FILES.gradle);
  it("RN-21: applies com.facebook.react for non-Expo new-arch builds and configures the spec name/package", () => {
    expect(gradle).toMatch(/apply plugin:\s*["']com\.facebook\.react["']/);
    expect(gradle).toMatch(/libraryName\s*=\s*["']NativeDeepLinkNowSpec["']/);
    expect(gradle).toMatch(
      /codegenJavaPackageName\s*=\s*["']com\.deeplinknow\.reactnative["']/
    );
  });
  it("RN-21: the generated codegen sources are on the new-arch source set", () => {
    expect(gradle).toMatch(/generated\/source\/codegen\/java/);
  });
  it("RN-21: package.json codegenConfig matches", () => {
    expect(pkg.codegenConfig).toMatchObject({
      name: "NativeDeepLinkNowSpec",
      type: "modules",
      jsSrcsDir: "./src/specs",
      android: { javaPackageName: "com.deeplinknow.reactnative" },
    });
  });
});

describe("RN-18: Kotlin suspend calls only from coroutines; scope cancelled", () => {
  const SUSPEND =
    /\.(findDeferredUser|checkDeferredDeepLink|checkClipboard|awaitInitialization|awaitReferrerData|findDeferredUserResult)\(/;

  it("RN-18: the Expo Android module uses `Coroutine` for every AsyncFunction and cancels its scope OnDestroy", () => {
    const src = read(FILES.androidExpo);
    const asyncFns = [...src.matchAll(/AsyncFunction\("(\w+)"\)([^{\n]*)\{/g)];
    expect(asyncFns.length).toBeGreaterThan(0);
    for (const m of asyncFns) {
      expect(m[2]).toContain("Coroutine");
    }
    expect(src).not.toMatch(/delay\(\s*100\s*\)/);
    if (/moduleScope/.test(src)) {
      expect(src).toMatch(/OnDestroy\s*\{[^}]*moduleScope\.cancel\(\)/);
    }
  });

  it.each(["androidNew", "androidOld"] as const)(
    "RN-18: %s calls suspend SDK functions only inside moduleScope.launch and cancels the scope in invalidate()",
    (key) => {
      const src = read(FILES[key]);
      expect(src).not.toMatch(/delay\(\s*100\s*\)/);
      const chunks = src
        .split(/\n\s*(?:@ReactMethod[^\n]*\n\s*)?(?:override\s+)?fun\s+/)
        .slice(1);
      for (const chunk of chunks) {
        const [body] = chunk.split(
          /\n\s{4}(?:override\s+)?fun\s+|\n\s{4}private\s+fun\s+/
        );
        if (SUSPEND.test(body) && !/^(convert|to)/.test(chunk)) {
          expect(body).toMatch(/moduleScope\.launch/);
        }
      }
      expect(src).toMatch(
        /override fun invalidate\(\)[\s\S]*?moduleScope\.cancel\(\)/
      );
    }
  );
});

describe("RN-02: every flavor implements every native spec method", () => {
  it("spec methods were parsed", () => {
    expect(SPEC_METHODS).toEqual(
      expect.arrayContaining([
        "initializeWithConfig",
        "isInitialized",
        "checkDeferredDeepLink",
        "resetDeferredDeepLink",
        "findDeferredUser",
        "getReferrerData",
        "isValidDomain",
        "parseDeepLink",
        "checkClipboard",
        "hasDeepLinkToken",
      ])
    );
  });

  it.each(SPEC_METHODS)(
    "RN-02: %s exists in all five native modules",
    (name) => {
      expect(read(FILES.iosExpo)).toMatch(
        new RegExp(`Function\\("${name}"\\)`)
      );
      expect(read(FILES.androidExpo)).toMatch(
        new RegExp(`Function\\("${name}"\\)`)
      );
      expect(read(FILES.iosTurbo)).toMatch(
        new RegExp(
          `RCT_EXPORT_(METHOD|BLOCKING_SYNCHRONOUS_METHOD)\\(${name}\\b`
        )
      );
      expect(read(FILES.androidNew)).toMatch(
        new RegExp(`override fun ${name}\\(`)
      );
      expect(read(FILES.androidOld)).toMatch(new RegExp(`fun ${name}\\(`));
    }
  );
});

describe("RN-03: native glue emits the wire shape for findDeferredUser", () => {
  const SNAKE = [
    "confidence_score",
    "match_quality",
    "match_details",
    "target_url",
    "query_params",
    "full_path",
    "ttl_seconds",
  ];
  it.each(["iosCore", "androidShared"] as const)(
    "RN-03: %s converts to snake_case keys",
    (key) => {
      const file =
        key === "iosCore"
          ? FILES.iosCore
          : "android/src/shared/java/com/deeplinknow/reactnative/DLNBridgeConverters.kt";
      const src = read(file);
      for (const k of SNAKE) {
        expect(src).toContain(`"${k}"`);
      }
      expect(src).not.toContain('"ttlSeconds"');
      expect(src).not.toContain('"ipMatch"');
    }
  );

  it("RN-03: the iOS Expo module reuses the shared converter instead of its own camelCase copy", () => {
    const src = read(FILES.iosExpo);
    expect(src).toContain("DeepLinkNowCore");
    expect(src).not.toContain('"ttlSeconds"');
  });

  it("RN-03: every Android flavor compiles the shared converters", () => {
    const gradle = read(FILES.gradle);
    expect(gradle).toMatch(/src\/shared\/java/);
  });
});

describe("RN-22: package metadata and minimums", () => {
  it("RN-22: peer ranges (react-native >= 0.71, expo/expo-modules-core optional)", () => {
    expect(pkg.peerDependencies["react-native"]).toBe(">=0.71.0");
    expect(pkg.peerDependenciesMeta.expo.optional).toBe(true);
    expect(pkg.peerDependenciesMeta["expo-modules-core"].optional).toBe(true);
    expect(pkg.dependencies?.["expo-modules-core"]).toBeUndefined();
  });

  it("RN-22: README minimums match the native SDKs (iOS 13, Android API 24)", () => {
    const readme = read("README.md");
    expect(readme).toMatch(/iOS 13/);
    expect(readme).toMatch(/API (level )?24/);
    expect(readme).not.toMatch(/iOS 11|API level 21|customDomain/);
    // deeplink.now is not a DLN domain (SDK-31); the README may only mention it as untrusted.
    for (const line of readme
      .split("\n")
      .filter((l) => l.includes("deeplink.now"))) {
      expect(line).toMatch(/no longer trusted/);
    }
  });

  it("RN-22: Android minSdk default is 24", () => {
    expect(read(FILES.gradle)).toMatch(
      /minSdkVersion safeExtGet\("minSdkVersion", 24\)/
    );
  });

  it("version is bumped as a minor from 1.1.20", () => {
    expect(pkg.version).toBe("1.2.0");
  });
});

describe("RN-19: react-native.config.js only autolinks Turbo/bridge outside Expo", () => {
  /** Loads react-native.config.js in a fresh Node process with the given app as cwd. */
  const loadRnConfig = (cwd: string, env: Record<string, string> = {}) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "-e",
          `process.stdout.write(JSON.stringify(require(${JSON.stringify(
            join(ROOT, "react-native.config.js")
          )}).dependency.platforms))`,
        ],
        { cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } }
      )
    );

  it("RN-19: an Expo app gets no React Native CLI entries (Expo autolinking links the Expo module)", () => {
    const app = dirname(makeApp("expo"));
    expect(loadRnConfig(app)).toEqual({ android: null, ios: null });
  });

  it("RN-19: a bare app autolinks the podspec and DeepLinkNowPackage", () => {
    const app = dirname(makeApp("bare"));
    const platforms = loadRnConfig(app);
    expect(platforms.ios.podspecPath).toBe("./DeeplinknowReactNative.podspec");
    expect(platforms.android.packageInstance).toBe("new DeepLinkNowPackage()");
  });

  it("RN-19: USE_EXPO_MODULES overrides detection", () => {
    const expoApp = dirname(makeApp("expo"));
    expect(
      loadRnConfig(expoApp, { USE_EXPO_MODULES: "0" }).android
    ).not.toBeNull();
    const bareApp = dirname(makeApp("bare"));
    expect(loadRnConfig(bareApp, { USE_EXPO_MODULES: "1" })).toEqual({
      android: null,
      ios: null,
    });
  });
});

describe("RN-20: config plugin packaging", () => {
  it("RN-20: plugin/build is emitted as CommonJS, because app.plugin.js loads it with require()", () => {
    // The shared expo-module-scripts base emits ESM with extensionless relative imports,
    // which Node cannot load ("Cannot find module .../plugin/build/domains").
    expect(read("plugin/tsconfig.json")).toMatch(/"module":\s*"commonjs"/);
    expect(read("app.plugin.js")).toMatch(
      /require\(['"]\.\/plugin\/build\/index\.js['"]\)/
    );
  });
});

describe("RN-19: podspec location (autolinking)", () => {
  it("RN-19: the podspec is at the package root, where the React Native CLI looks for it", () => {
    // @react-native-community/cli-config-apple globs `*.podspec` in the package root only
    // and ignores react-native.config.js `podspecPath`.
    expect(existsSync(join(ROOT, "DeeplinknowReactNative.podspec"))).toBe(true);
    expect(existsSync(join(ROOT, "ios/DeeplinknowReactNative.podspec"))).toBe(
      false
    );
    expect(pkg.files).toContain("*.podspec");
  });

  it("RN-19: Expo autolinking is pointed at the root podspec", () => {
    const cfg = JSON.parse(read("expo-module.config.json"));
    expect(cfg.ios.podspecPath).toBe("DeeplinknowReactNative.podspec");
  });

  it("RN-19: every podspec source_files entry matches real files (paths relative to the podspec)", () => {
    const src = read(FILES.podspec);
    const entries = [...src.matchAll(/^\s+"(ios\/[^"]+)"/gm)].map((m) => m[1]);
    expect(entries.length).toBe(4);
    for (const entry of entries) {
      const literal = entry
        .replace(/\/\*\*\/\*\.swift$/, "")
        .replace(/\.\{h,mm\}$/, ".h");
      expect(existsSync(join(ROOT, literal))).toBe(true);
    }
  });
});
