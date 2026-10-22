/**
 * `useDeferredDeepLink()` under a real React renderer (RN-31, RN-33, RN-34): effect
 * dependencies, StrictMode's double effects, and sign-in landing before or after the check.
 * The other hook tests call it outside a renderer; these mount it.
 */
import type { ReactTestRenderer } from "react-test-renderer";

import { deferredLink, loadSdk, silenceConsole } from "./support/helpers";

const KEY = "dln_live_supersecretkey_9876";

interface Result {
  heldLink: unknown;
  link: unknown;
}

/** Loads the SDK, then React and the renderer from the same module registry. */
function setup(checkDeferredDeepLink: () => Promise<unknown>) {
  const { mod } = loadSdk({ native: { checkDeferredDeepLink } });
  const React = require("react");
  const TestRenderer = require("react-test-renderer");
  const latest: { current: Result | null } = { current: null };

  function Probe(props: { hold?: boolean; onLink?: (l: unknown) => void }) {
    latest.current = mod.useDeferredDeepLink({ apiKey: KEY, ...props });
    return null;
  }

  let root: ReactTestRenderer | null = null;
  const el = (props: object, strict: boolean) =>
    strict
      ? React.createElement(
          React.StrictMode,
          null,
          React.createElement(Probe, props)
        )
      : React.createElement(Probe, props);

  return {
    latest,
    async render(props: object, strict = true) {
      await TestRenderer.act(async () => {
        if (root) {
          root.update(el(props, strict));
        } else {
          root = TestRenderer.create(el(props, strict));
        }
      });
    },
    async unmount() {
      await TestRenderer.act(async () => {
        root?.unmount();
        root = null;
      });
    },
    act: TestRenderer.act as (fn: () => Promise<void>) => Promise<void>,
  };
}

/** A check that resolves when the test says so. */
function deferred() {
  let resolve: (v: unknown) => void = () => undefined;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { check: () => promise, resolve };
}

describe("RN-31 / RN-33 / RN-34: the hook under a real React renderer", () => {
  beforeEach(() => {
    silenceConsole();
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("RN-34: in StrictMode, onLink runs exactly once when sign-in opens the gate", async () => {
    const t = setup(async () => deferredLink());
    const onLink = jest.fn();
    await t.render({ hold: true, onLink });
    expect(onLink).not.toHaveBeenCalled();
    expect(t.latest.current?.heldLink).toMatchObject({ path: "/products/123" });

    await t.render({ hold: false, onLink });
    await t.render({ hold: false, onLink });
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(t.latest.current).toMatchObject({ link: null, heldLink: null });
  });

  it("RN-34: StrictMode's double effect on mount, with the link already found, delivers once", async () => {
    const t = setup(async () => deferredLink());
    await t.render({ hold: true });
    await t.unmount();
    // A signed-in screen mounts after the check finished: StrictMode runs its effects twice.
    const onLink = jest.fn();
    await t.render({ hold: false, onLink });
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("RN-33 / RN-34: signed in before the check resolves: delivered once when it does", async () => {
    const d = deferred();
    const t = setup(d.check);
    const onLink = jest.fn();
    await t.render({ hold: true, onLink });
    await t.render({ hold: false, onLink });
    expect(onLink).not.toHaveBeenCalled();
    await t.act(async () => {
      d.resolve(deferredLink());
    });
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("RN-33: the check resolves first, sign-in comes later: held, then delivered once", async () => {
    const d = deferred();
    const t = setup(d.check);
    const onLink = jest.fn();
    await t.render({ hold: true, onLink });
    await t.act(async () => {
      d.resolve(deferredLink());
    });
    expect(onLink).not.toHaveBeenCalled();
    expect(t.latest.current?.heldLink).not.toBeNull();
    await t.render({ hold: false, onLink });
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("RN-33: sign-out and sign-in again (or as another user) never re-delivers", async () => {
    const t = setup(async () => deferredLink());
    const onLink = jest.fn();
    await t.render({ hold: false, onLink });
    await t.render({ hold: true, onLink });
    await t.render({ hold: false, onLink });
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("RN-31: unmounting while the check is pending keeps the link for the next mount", async () => {
    const d = deferred();
    const t = setup(d.check);
    const onLink = jest.fn();
    await t.render({ hold: true, onLink });
    await t.unmount();
    await t.act(async () => {
      d.resolve(deferredLink());
    });
    await t.render({ hold: false, onLink });
    expect(onLink).toHaveBeenCalledTimes(1);
  });

  it("RN-34 / SDK-85: an onLink that throws is logged, and the link stays handled", async () => {
    const t = setup(async () => deferredLink());
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const onLink = jest.fn(() => {
      throw new Error("navigation not ready");
    });
    await t.render({ hold: false, onLink });
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("onLink threw"),
      expect.any(Error)
    );
    expect(t.latest.current?.link).toBeNull();
  });
});
