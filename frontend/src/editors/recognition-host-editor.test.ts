/** Control-flow fixtures only; native chemical identity has the graphical CI gate. */
import { expect, it, vi } from "vitest";
import {
  configureRecognitionEditor,
  type RecognitionEditor,
} from "./recognition-host-editor";

const graph = (identity: string, hydrogen = false) =>
  JSON.stringify({
    identity,
    mol0: {
      type: "molecule",
      atoms: hydrogen ? [{ label: "C" }, { label: "H" }] : [{ label: "C" }],
      bonds: hydrogen ? [{ atoms: [0, 1] }] : [],
    },
  });
const carbon = graph("carbon"),
  nitrogen = graph("nitrogen"),
  explicit = graph("carbon", true);
function fixture() {
  let current = "{}";
  const listeners = new Set<() => void>(),
    failures = new Set<() => void>();
  const controller = new AbortController(),
    state = vi.fn(),
    error = vi.fn(),
    fit = vi.fn(() => true),
    resetZoom = vi.fn();
  const source = (value: string) =>
    value === "source-A" ? carbon : value === "source-B" ? nitrogen : value;
  const native: RecognitionEditor = {
    editor: { setOptions: vi.fn() },
    changeEvent: {
      add: (fn) => {
        listeners.add(fn);
      },
      remove: (fn) => {
        listeners.delete(fn);
      },
    },
    eventBus: {
      addListener: (_event, fn) => failures.add(fn),
      removeListener: (_event, fn) => failures.delete(fn),
    },
    structService: {
      layout: vi.fn(async (data) => ({ struct: source(data.struct) })),
      toggleExplicitHydrogens: vi.fn(async () => ({ struct: carbon })),
      getInChIKey: vi.fn(
        async (value) => JSON.parse(source(value)).identity ?? "empty-key",
      ),
    },
    getKet: vi.fn(async () => current),
    getMolfile: vi.fn(async () => current),
    getSmiles: vi.fn(async () => current),
    setMolecule: vi.fn(async (value) => {
      current = value.includes("0999 V2000") ? "{}" : value;
      listeners.forEach((fn) => fn());
    }),
  };
  const policy = configureRecognitionEditor(native, controller.signal, error, {
    fit,
    resetZoom,
    onState: state,
  });
  return {
    native,
    policy,
    controller,
    state,
    error,
    fit,
    resetZoom,
    current: () => current,
    edit: (value: string) => {
      current = value;
      listeners.forEach((fn) => fn());
    },
    fail: () => failures.forEach((fn) => fn()),
    listenerCount: () => listeners.size + failures.size,
  };
}
async function ready(f: ReturnType<typeof fixture>) {
  await f.policy.load("");
  await vi.waitFor(() =>
    expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: false }),
  );
  vi.mocked(f.native.setMolecule).mockClear();
}
it("loads a separate native layout and verifies the actual canvas before exposing exports", async () => {
  const f = fixture();
  await ready(f);
  expect(f.resetZoom).toHaveBeenCalled();
  expect(await f.policy.load("source-A")).toBe(true);
  expect(f.current()).toBe(carbon);
  expect(f.fit).toHaveBeenCalled();
  expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: true });
  f.controller.abort();
});
it.each([true, false])(
  "rejects swallowed native failure (failure event=%s)",
  async (event) => {
    const f = fixture();
    await ready(f);
    await f.policy.load("source-A");
    vi.mocked(f.native.setMolecule).mockImplementationOnce(async () => {
      if (event) f.fail();
    });
    await expect(f.policy.load("source-B")).rejects.toThrow("载入结果");
    expect(f.current()).toBe(carbon);
    expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: false });
    f.controller.abort();
  },
);
it("keeps a newer canvas edit made while preparing a source", async () => {
  const f = fixture();
  await ready(f);
  let finish!: (value: { struct: string }) => void;
  vi.mocked(f.native.structService.layout!).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const loading = f.policy.load("source-A");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  f.edit(nitrogen);
  finish({ struct: carbon });
  expect(await loading).toBe(false);
  expect(f.current()).toBe(nitrogen);
  expect(f.native.setMolecule).not.toHaveBeenCalled();
  f.controller.abort();
});
it("serializes successive source intents and never commits the superseded source", async () => {
  const f = fixture();
  await ready(f);
  let finish!: (value: { struct: string }) => void;
  vi.mocked(f.native.structService.layout!).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = f.policy.load("source-A");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  const second = f.policy.load("source-B");
  finish({ struct: carbon });
  expect(await first).toBe(false);
  expect(await second).toBe(true);
  expect(f.current()).toBe(nitrogen);
  expect(f.native.setMolecule).toHaveBeenCalledExactlyOnceWith(nitrogen);
  f.controller.abort();
});
it("does not freeze or relayout ordinary drawing and manual layout changes", async () => {
  const f = fixture();
  await ready(f);
  f.state.mockClear();
  vi.mocked(f.native.structService.layout!).mockClear();
  f.edit(carbon);
  await vi.waitFor(() => expect(f.fit).toHaveBeenCalledOnce());
  f.state.mockClear();
  const moved = JSON.stringify({
    ...JSON.parse(carbon),
    manualLayout: "user arrangement",
  });
  f.edit(moved);
  await vi.waitFor(() => expect(f.state).toHaveBeenCalled());
  expect(f.current()).toBe(moved);
  expect(f.fit).toHaveBeenCalledOnce();
  expect(f.state.mock.calls.some(([value]) => value.busy)).toBe(false);
  expect(f.native.structService.layout).not.toHaveBeenCalled();
  expect(f.native.setMolecule).not.toHaveBeenCalled();
  f.controller.abort();
});
it("validates explicit-H edits without rewriting Undo/Redo, then reviews on request", async () => {
  const f = fixture();
  await ready(f);
  vi.mocked(f.native.structService.layout!).mockClear();
  f.edit(explicit);
  await vi.waitFor(() =>
    expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: false }),
  );
  expect(f.current()).toBe(explicit);
  expect(f.native.setMolecule).not.toHaveBeenCalled();
  expect(f.policy.retainedDrawing()).toBe(explicit);
  expect(await f.policy.recheck()).toBe(true);
  expect(f.current()).toBe(carbon);
  expect(f.native.structService.layout).toHaveBeenCalledWith({
    struct: explicit,
    output_format: "chemical/x-indigo-ket",
  });
  expect(f.native.structService.toggleExplicitHydrogens).toHaveBeenCalledWith({
    struct: explicit,
    mode: "fold",
    output_format: "chemical/x-indigo-ket",
  });
  expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: true });
  const commits = vi.mocked(f.native.setMolecule).mock.calls.length;
  f.edit(explicit);
  await vi.waitFor(() =>
    expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: false }),
  );
  expect(f.native.setMolecule).toHaveBeenCalledTimes(commits);
  f.edit(carbon);
  await vi.waitFor(() =>
    expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: true }),
  );
  expect(f.native.setMolecule).toHaveBeenCalledTimes(commits);
  f.controller.abort();
});
it("retains the previous drawing when a new load fails and can recheck it", async () => {
  const f = fixture();
  await ready(f);
  await f.policy.load("source-A");
  vi.mocked(f.native.setMolecule).mockImplementationOnce(async () => {
    f.fail();
  });
  await expect(f.policy.load("source-B")).rejects.toThrow();
  expect(f.policy.retainedDrawing()).toBe(carbon);
  expect(await f.policy.recheck()).toBe(true);
  expect(f.current()).toBe(carbon);
  expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: true });
  f.controller.abort();
});
it("refuses an identity-changing preparation before changing the prior canvas", async () => {
  const f = fixture();
  await ready(f);
  vi.mocked(f.native.structService.layout!).mockResolvedValueOnce({
    struct: nitrogen,
  });
  await expect(f.policy.load("source-A")).rejects.toThrow("分子身份");
  expect(f.current()).toBe("{}");
  expect(f.native.setMolecule).not.toHaveBeenCalled();
  f.controller.abort();
});
it("does not commit or publish after closure during native preparation", async () => {
  const f = fixture();
  await ready(f);
  let finish!: (value: { struct: string }) => void;
  vi.mocked(f.native.structService.layout!).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const loading = f.policy.load("source-A");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  f.controller.abort();
  f.state.mockClear();
  finish({ struct: carbon });
  await expect(loading).rejects.toThrow();
  expect(f.native.setMolecule).not.toHaveBeenCalled();
  expect(f.state).not.toHaveBeenCalled();
  expect(f.listenerCount()).toBe(0);
});
it("defers fitting a hidden canvas until visible and does not reload molecular data", async () => {
  const f = fixture();
  await ready(f);
  f.fit.mockReturnValue(false);
  await f.policy.load("source-A");
  const calls = vi.mocked(f.native.setMolecule).mock.calls.length;
  f.fit.mockReturnValue(true);
  f.policy.fitWhenVisible();
  const fits = f.fit.mock.calls.length;
  f.policy.fitWhenVisible();
  expect(f.fit).toHaveBeenCalledTimes(fits);
  f.policy.fitWhenVisible(true);
  expect(f.fit).toHaveBeenCalledTimes(fits + 1);
  expect(f.native.setMolecule).toHaveBeenCalledTimes(calls);
  expect(f.current()).toBe(carbon);
  f.controller.abort();
});

it("invalidates export approval synchronously while native serialization waits", async () => {
  const f = fixture();
  await ready(f);
  await f.policy.load("source-A");
  let finish!: (value: string) => void;
  vi.mocked(f.native.getKet).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  f.edit(explicit);
  expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: false });
  finish(explicit);
  await vi.waitFor(() => expect(f.error).toHaveBeenCalled());
  expect(f.native.setMolecule).toHaveBeenCalledTimes(1);
  f.controller.abort();
});

it.each([2, 3])(
  "rechecks abort/failure after identity await %s",
  async (boundary) => {
    for (const event of ["abort", "failure"]) {
      const f = fixture();
      await ready(f);
      const original = vi
        .mocked(f.native.structService.getInChIKey)
        .getMockImplementation()!;
      let count = 0,
        finish!: (value: string) => void;
      vi.mocked(f.native.structService.getInChIKey).mockImplementation(
        (value) => {
          if (++count === boundary)
            return new Promise((resolve) => {
              finish = resolve;
            });
          return original(value);
        },
      );
      const loading = f.policy.load("source-A");
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      if (event === "abort") {
        f.controller.abort();
        f.state.mockClear();
      } else f.fail();
      finish("carbon");
      await expect(loading).rejects.toThrow();
      if (event === "abort") expect(f.state).not.toHaveBeenCalled();
      else
        expect(f.state).toHaveBeenLastCalledWith({
          busy: false,
          available: false,
        });
      if (boundary === 2) expect(f.native.setMolecule).not.toHaveBeenCalled();
      f.controller.abort();
    }
  },
);

it("supersedes an intent during its final prepared-identity lookup", async () => {
  const f = fixture();
  await ready(f);
  const original = vi
    .mocked(f.native.structService.getInChIKey)
    .getMockImplementation()!;
  let count = 0,
    finish!: (value: string) => void;
  vi.mocked(f.native.structService.getInChIKey).mockImplementation((value) => {
    if (++count === 2)
      return new Promise((resolve) => {
        finish = resolve;
      });
    return original(value);
  });
  const first = f.policy.load("source-A");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  const second = f.policy.load("source-B");
  finish("carbon");
  expect(await first).toBe(false);
  expect(await second).toBe(true);
  expect(f.native.setMolecule).toHaveBeenCalledExactlyOnceWith(nitrogen);
  f.controller.abort();
});

it("does not restore approval when native failure arrives during recovery identity lookup", async () => {
  const f = fixture();
  await ready(f);
  await f.policy.load("source-A");
  f.fail();
  f.state.mockClear();
  const original = vi
    .mocked(f.native.structService.getInChIKey)
    .getMockImplementation()!;
  let checked = false;
  vi.mocked(f.native.structService.getInChIKey).mockImplementation(
    async (value) => {
      f.fail();
      const result = await original(value);
      checked = true;
      return result;
    },
  );
  f.edit(nitrogen);
  await vi.waitFor(() => expect(checked).toBe(true));
  expect(f.state.mock.calls.every(([state]) => !state.available)).toBe(true);
  expect(f.policy.retainedDrawing()).toBe(carbon);
  f.controller.abort();
});

it("requires explicit 2D preparation for a hydrogen-free native 3D import", async () => {
  const f = fixture();
  await ready(f);
  const spatial = JSON.stringify({
    identity: "carbon",
    mol0: { type: "molecule", atoms: [{ label: "C", location: [0, 0, 1] }] },
  });
  f.edit(spatial);
  expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: false });
  await vi.waitFor(() => expect(f.error).toHaveBeenCalled());
  expect(f.current()).toBe(spatial);
  const fits = f.fit.mock.calls.length;
  f.policy.fitWhenVisible(true);
  expect(f.fit).toHaveBeenCalledTimes(fits);
  expect(f.native.setMolecule).not.toHaveBeenCalled();
  vi.mocked(f.native.structService.layout!).mockResolvedValueOnce({
    struct: carbon,
  });
  expect(await f.policy.recheck()).toBe(true);
  expect(f.current()).toBe(carbon);
  f.controller.abort();
});
it("refuses native layout that still contains 3D coordinates before committing", async () => {
  const f = fixture();
  await ready(f);
  const spatial = JSON.stringify({
    identity: "carbon",
    mol0: { type: "molecule", atoms: [{ label: "C", location: [0, 0, 1] }] },
  });
  vi.mocked(f.native.structService.layout!).mockResolvedValueOnce({
    struct: spatial,
  });
  await expect(f.policy.load("source-A")).rejects.toThrow("二维结构");
  expect(f.native.setMolecule).not.toHaveBeenCalled();
  expect(f.current()).toBe("{}");
  f.controller.abort();
});

it("never exposes export approval for an empty native history state with stale SMILES", async () => {
  const f = fixture();
  await ready(f);
  await f.policy.load("source-A");
  f.state.mockClear();
  f.edit("{}");
  expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: false });
  await vi.waitFor(() => expect(f.state.mock.calls.length).toBeGreaterThan(1));
  expect(f.state.mock.calls.every(([state]) => !state.available)).toBe(true);
  expect(f.policy.retainedDrawing()).toBeNull();
  f.edit(carbon);
  await vi.waitFor(() =>
    expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: true }),
  );
  f.controller.abort();
});

it("fits cumulative small resizes and defers an unavailable canvas without rewriting it", async () => {
  const f = fixture();
  await ready(f);
  await f.policy.load("source-A");
  const originalFits = f.fit.mock.calls.length;
  f.policy.resize(1000, 600);
  for (let width = 950; width > 390; width = Math.floor(width * 0.95))
    f.policy.resize(width, 600);
  f.policy.resize(390, 600);
  expect(f.fit.mock.calls.length).toBeGreaterThan(originalFits + 3);
  const fits = f.fit.mock.calls.length;
  f.fail();
  f.policy.resize(1000, 600);
  expect(f.fit).toHaveBeenCalledTimes(fits);
  f.edit(carbon);
  await vi.waitFor(() => expect(f.fit).toHaveBeenCalledTimes(fits + 1));
  expect(f.state).toHaveBeenLastCalledWith({ busy: false, available: true });
  expect(f.native.setMolecule).toHaveBeenCalledExactlyOnceWith(carbon);
  f.controller.abort();
});
