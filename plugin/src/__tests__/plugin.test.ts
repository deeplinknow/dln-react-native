import withDeepLinkNow from "../index";

function baseConfig(extra: Record<string, any> = {}): any {
  return { name: "app", slug: "app", ...extra };
}

describe("RN-20: Expo config plugin", () => {
  it("RN-20: with no props it is a safe no-op", () => {
    const cfg = baseConfig({ ios: { bundleIdentifier: "com.x" } });
    const out = withDeepLinkNow(JSON.parse(JSON.stringify(cfg)));
    expect(out.ios).toEqual(cfg.ios);
    expect(out.android?.intentFilters).toBeUndefined();
  });

  it("RN-20: adds applinks:<domain> to iOS associatedDomains for each domain", () => {
    const out = withDeepLinkNow(baseConfig(), {
      domains: ["myapp.deeplinknow.com", "go.myapp.com"],
    });
    expect(out.ios?.associatedDomains).toEqual([
      "applinks:myapp.deeplinknow.com",
      "applinks:go.myapp.com",
    ]);
  });

  it("RN-20: keeps existing associated domains and does not duplicate entries", () => {
    const out = withDeepLinkNow(
      baseConfig({
        ios: {
          associatedDomains: [
            "webcredentials:x.com",
            "applinks:myapp.deeplinknow.com",
          ],
        },
      }),
      { domains: ["myapp.deeplinknow.com", "MyApp.DeepLinkNow.com"] }
    );
    expect(out.ios?.associatedDomains).toEqual([
      "webcredentials:x.com",
      "applinks:myapp.deeplinknow.com",
    ]);
  });

  it("RN-20: adds one autoVerify https VIEW intent filter per domain on Android", () => {
    const out = withDeepLinkNow(baseConfig(), {
      domains: ["myapp.deeplinknow.com", "go.myapp.com"],
    });
    expect(out.android?.intentFilters).toEqual([
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "myapp.deeplinknow.com" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "go.myapp.com" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ]);
  });

  it("RN-20: keeps existing intent filters and does not add a duplicate for an already-declared host", () => {
    const existing = {
      action: "VIEW",
      autoVerify: true,
      data: [{ scheme: "https", host: "myapp.deeplinknow.com" }],
      category: ["BROWSABLE", "DEFAULT"],
    };
    const other = {
      action: "VIEW",
      data: [{ scheme: "myapp" }],
      category: ["DEFAULT"],
    };
    const out = withDeepLinkNow(
      baseConfig({ android: { intentFilters: [other, existing] } }),
      {
        domains: ["myapp.deeplinknow.com"],
      }
    );
    expect(out.android?.intentFilters).toEqual([other, existing]);
  });

  it("RN-20: normalizes domains (strips scheme, path, trailing dot, case) and rejects invalid ones", () => {
    const out = withDeepLinkNow(baseConfig(), {
      domains: ["https://Go.MyApp.com/", "myapp.deeplinknow.com.", ""],
    });
    expect(out.ios?.associatedDomains).toEqual([
      "applinks:go.myapp.com",
      "applinks:myapp.deeplinknow.com",
    ]);
    expect(() =>
      withDeepLinkNow(baseConfig(), { domains: "x.com" as any })
    ).toThrow(/domains/);
  });

  it("RN-20: the unused iosDeploymentTarget / androidMinSdkVersion props are no longer accepted", () => {
    // Type-level removal; at runtime unknown props are ignored.
    const out = withDeepLinkNow(baseConfig(), {
      iosDeploymentTarget: "11.0",
    } as any);
    expect(out.ios?.deploymentTarget).toBeUndefined();
  });
});
