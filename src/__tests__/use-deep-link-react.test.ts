/**
 * `useDeepLink()` under a real React renderer and StrictMode (SDK-89, RN-39): `link`,
 * `pendingLink`, `isLoading`, `release` and `clear`.
 */
import type { ReactTestRenderer } from "react-test-renderer";

import { deferredLink, loadSdk, silenceConsole } from "./support/helpers";

const KEY = "dln_live_supersecretkey_9876";
const LINK_URL = "https://myapp.deeplinknow.com/invite/abc";

interface Result {
  clear: () => void;
  isLoading: boolean;
  link: { fullPath: string; type: string } | null;
  pendingLink: { fullPath: string; type: string } | null;
  pendingLinks: readonly { fullPath: string; type: string }[];
  release: () => void;
}

function nativeParse(url: string) {
  const m = /^https:\/\/myapp\.deeplinknow\.com(\/[^?#]*)/.exec(url);
  return m ? { path: m[1], queryParams: {}, fullPath: m[1], url } : null;
}

function setup(
  checkDeferredDeepLink: () => Promise<unknown>,
  initialUrl: string | null = null
) {
  const { mod, sdk, linking } = loadSdk({
    initialUrl,
    native: { checkDeferredDeepLink, parseDeepLink: nativeParse },
  });
  const React = require("react");
  const TestRenderer = require("react-test-renderer");
  const latest: { current: Result | null } = { current: null };
  const renders: Result[] = [];

  function Probe(props: { enabled?: boolean; hold?: boolean }) {
    latest.current = mod.useDeepLink({ apiKey: KEY, ...props });
    renders.push(latest.current as Result);
    return null;
  }

  let root: ReactTestRenderer | null = null;
  const el = (props: object) =>
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(Probe, props)
    );

  const act = TestRenderer.act as (fn: () => Promise<void>) => Promise<void>;
  return {
    sdk,
    linking,
    latest,
    renders,
    act,
    async render(props: object = {}) {
      await act(async () => {
        if (root) {
          root.update(el(props));
        } else {
          root = TestRenderer.create(el(props));
        }
      });
    },
  };
}

function deferred() {
  let resolve: (v: unknown) => void = () => undefined;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { check: () => promise, resolve };
}

describe("SDK-89 / RN-39: useDeepLink", () => {
  beforeEach(() => {
    silenceConsole();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("SDK-89 / RN-39: isLoading while the deferred check runs, then link is the deferred DLNLink", async () => {
    const d = deferred();
    const t = setup(d.check);
    await t.render();
    expect(t.latest.current).toMatchObject({
      isLoading: true,
      link: null,
      pendingLink: null,
    });
    await t.act(async () => {
      d.resolve(deferredLink());
    });
    expect(t.latest.current).toMatchObject({
      isLoading: false,
      link: { type: "deferred", fullPath: deferredLink().fullPath },
      pendingLink: null,
    });
  });

  it("SDK-89 / RN-39: no link: isLoading turns false and link stays null", async () => {
    const t = setup(async () => null);
    await t.render();
    expect(t.latest.current).toMatchObject({ isLoading: false, link: null });
  });

  it("SDK-89 / RN-39: hold keeps a direct open in pendingLink; turning hold off delivers it once (StrictMode)", async () => {
    const t = setup(async () => null);
    await t.render({ hold: true });
    await t.act(async () => {
      t.linking.emit(LINK_URL);
      await Promise.resolve();
    });
    expect(t.latest.current).toMatchObject({
      link: null,
      pendingLink: { type: "direct", fullPath: "/invite/abc" },
      pendingLinks: [{ type: "direct", fullPath: "/invite/abc" }],
    });
    await t.render({ hold: false });
    expect(t.latest.current).toMatchObject({
      link: { type: "direct", fullPath: "/invite/abc" },
      pendingLink: null,
    });
    const delivered = new Set(
      t.renders.map((r) => r.link).filter((l) => l !== null)
    );
    expect(delivered.size).toBe(1);
  });

  it("SDK-89 / RN-39: release() delivers while hold is still true and ends the hold", async () => {
    const t = setup(async () => deferredLink());
    await t.render({ hold: true });
    expect(t.latest.current?.pendingLink).toMatchObject({ type: "deferred" });
    await t.act(async () => {
      t.latest.current?.release();
    });
    expect(t.latest.current).toMatchObject({
      link: { type: "deferred" },
      pendingLink: null,
    });
    // The hold is over: the next open goes straight to link.
    await t.act(async () => {
      t.linking.emit(LINK_URL);
      await Promise.resolve();
    });
    expect(t.latest.current).toMatchObject({
      link: { type: "direct", fullPath: "/invite/abc" },
      pendingLink: null,
    });
  });

  it("SDK-89 / RN-39: clear() drops the pending link, resets link and keeps the hold on", async () => {
    const t = setup(async () => null);
    await t.render({ hold: true });
    await t.act(async () => {
      t.linking.emit(LINK_URL);
      await Promise.resolve();
    });
    expect(t.latest.current?.pendingLink).toMatchObject({ type: "direct" });
    await t.act(async () => {
      t.latest.current?.clear();
    });
    expect(t.latest.current).toMatchObject({ link: null, pendingLink: null });
    await t.act(async () => {
      t.linking.emit("https://myapp.deeplinknow.com/invite/xyz");
      await Promise.resolve();
    });
    expect(t.latest.current).toMatchObject({
      link: null,
      pendingLink: { fullPath: "/invite/xyz" },
    });
    await t.render({ hold: false });
    expect(t.latest.current).toMatchObject({
      link: { fullPath: "/invite/xyz" },
      pendingLink: null,
    });
  });

  it("SDK-87 / RN-39: the launch URL arrives in link without any Linking code in the app", async () => {
    const t = setup(async () => null, LINK_URL);
    await t.render();
    expect(t.latest.current).toMatchObject({
      isLoading: false,
      link: { type: "direct", fullPath: "/invite/abc" },
    });
  });

  it("SDK-89 / RN-39: enabled: false registers nothing and starts no check", async () => {
    const check = jest.fn(async () => deferredLink());
    const t = setup(check);
    await t.render({ enabled: false });
    expect(check).not.toHaveBeenCalled();
    expect(t.latest.current).toMatchObject({ isLoading: false, link: null });
    expect(t.sdk.pendingLink).toBeNull();
  });
});
