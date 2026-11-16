import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkbenchDrawing } from "./useWorkbenchDrawing";
import { editorReady } from "./scientificEditor";
import { configureRecognitionEditor } from "./recognition-host-editor";

vi.mock("./scientificEditor", () => ({ editorReady: vi.fn() }));
vi.mock("./recognition-host-editor", () => ({
  configureRecognitionEditor: vi.fn(),
  createMolecularViewport: () => ({ fit: () => true, resetZoom: vi.fn() }),
}));
const disconnect = vi.fn();
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  const native = {
    getKet: vi.fn(),
    eventBus: {},
    structService: { getInChIKey: vi.fn() },
    getSmiles: vi.fn(async () => "STAT6 drawing"),
    getMolfile: vi.fn(async () => "V3000 drawing"),
  };
  const frame = {
    current: {
      contentWindow: { ketcher: native },
      contentDocument: document.implementation.createHTMLDocument(),
    } as unknown as HTMLIFrameElement,
  };
  const policy = {
    load: vi.fn(async () => true),
    recheck: vi.fn(async () => true),
    resize: vi.fn(),
    fitWhenVisible: vi.fn(),
  };
  vi.mocked(editorReady).mockResolvedValue(native as never);
  vi.mocked(configureRecognitionEditor).mockReturnValue(policy as never);
  const hook = renderHook(
    ({ generation }) => useWorkbenchDrawing(frame, generation, true),
    { initialProps: { generation: 1 } },
  );
  await waitFor(() =>
    expect(configureRecognitionEditor).toHaveBeenCalledOnce(),
  );
  const callbacks = vi.mocked(configureRecognitionEditor).mock.calls[0][3];
  return { ...hook, native, frame, policy, callbacks };
}

it("blocks empty/unapproved capture and uses the exact current native V3000 drawing after approval", async () => {
  const hook = await mount();
  await expect(hook.result.current.editor().getMolfile()).rejects.toThrow(
    "Review the current drawing",
  );
  expect(hook.native.getMolfile).not.toHaveBeenCalled();
  act(() => hook.callbacks.onState({ busy: false, available: true }));
  expect(await hook.result.current.editor().getMolfile()).toBe("V3000 drawing");
  expect(hook.native.getMolfile).toHaveBeenCalledWith("v3000");
  act(() => hook.callbacks.onState({ busy: false, available: false }));
  await expect(hook.result.current.editor().getSmiles()).rejects.toThrow(
    "Review the current drawing",
  );
});

it("rejects canvas changes while native serialization is awaiting", async () => {
  const hook = await mount();
  act(() => hook.callbacks.onState({ busy: false, available: true }));
  let finish!: (value: string) => void;
  hook.native.getMolfile.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const reading = hook.result.current.editor().getMolfile();
  act(() => hook.callbacks.onState({ busy: true, available: false }));
  finish("stale drawing");
  await expect(reading).rejects.toThrow("changed during export");
});

it("rejects stale frame identities before reads and after an in-flight import", async () => {
  const hook = await mount();
  act(() => hook.callbacks.onState({ busy: false, available: true }));
  let finish!: (value: boolean) => void;
  hook.policy.load.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const opening = hook.result.current.open("source");
  Object.defineProperty(hook.frame.current!.contentWindow, "ketcher", {
    value: {},
  });
  expect(() => hook.result.current.editor()).toThrow("editor changed");
  finish(true);
  await expect(opening).rejects.toThrow("editor changed");
  expect(hook.native.getMolfile).not.toHaveBeenCalled();
});

it("rebinds a new document and ignores old generation callbacks after cleanup", async () => {
  const hook = await mount();
  const previous = hook.callbacks;
  const oldSignal = vi.mocked(configureRecognitionEditor).mock.calls[0][1];
  const oldEditor = hook.result.current.editor();
  hook.rerender({ generation: 2 });
  await waitFor(() =>
    expect(configureRecognitionEditor).toHaveBeenCalledTimes(2),
  );
  expect(oldSignal.aborted).toBe(true);
  expect(disconnect).toHaveBeenCalled();
  act(() => previous.onState({ busy: false, available: true }));
  expect(hook.result.current.available).toBe(false);
  await expect(hook.result.current.editor().getMolfile()).rejects.toThrow();
  await expect(oldEditor.getMolfile()).rejects.toThrow("editor changed");
  await expect(oldEditor.setMolecule("old request")).rejects.toThrow(
    "editor changed",
  );
  hook.unmount();
  expect(vi.mocked(configureRecognitionEditor).mock.calls[1][1].aborted).toBe(
    true,
  );
});

it("exposes explicit retained-drawing recovery after a rejected owned import", async () => {
  const hook = await mount();
  act(() => hook.callbacks.onState({ busy: false, available: true }));
  hook.policy.load.mockRejectedValueOnce(new Error("Native layout rejected"));
  await act(async () => {
    await expect(hook.result.current.open("malformed MOL")).rejects.toThrow(
      "Native layout rejected",
    );
  });
  expect(hook.result.current.needsPreparation).toBe(true);
  expect(hook.result.current.available).toBe(false);
  hook.policy.recheck.mockImplementation(async () => {
    hook.callbacks.onState({ busy: false, available: true });
    hook.callbacks.onValidated?.();
    return true;
  });
  await act(async () => hook.result.current.prepare());
  expect(hook.result.current.needsPreparation).toBe(false);
  expect(await hook.result.current.editor().getMolfile()).toBe("V3000 drawing");
});

it("routes explicit preparation to the shared controller without automatic history writes", async () => {
  const hook = await mount();
  await hook.result.current.prepare();
  expect(hook.policy.recheck).toHaveBeenCalledOnce();
  expect(hook.policy.load).not.toHaveBeenCalled();
  hook.policy.load.mockResolvedValue(false);
  await expect(hook.result.current.open("new drawing")).rejects.toThrow(
    "changed while opening",
  );
});
