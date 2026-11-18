import { afterEach, expect, it, vi } from "vitest";
import {
  attachRecognitionBridge,
  type RecognitionHost,
} from "./recognition-host-bridge";

const descriptor = Object.getOwnPropertyDescriptor(window, "parent")!;
afterEach(() => {
  Object.defineProperty(window, "parent", descriptor);
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("a stalled export releases its lease and a later export can succeed without OCR", async () => {
  vi.useFakeTimers();
  const h = setup();
  let late!: (value: { smiles: string; molfile: string }) => void;
  h.host.molecule = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          late = resolve;
        }),
    )
    .mockResolvedValue({ smiles: "Nc1ccccc1", molfile: "M  END\n" });
  h.deliver({ type: "xdde-image:connect", file: h.file });
  await flush();
  h.commit();
  h.deliver({ type: "xdde-image:export", requestId: h.requestId });
  await vi.advanceTimersByTimeAsync(12000);
  expect(h.post).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: "xdde-image:result",
      requestId: h.requestId,
      molecule: null,
      error: "timeout",
    }),
    "http://127.0.0.1:4322",
  );
  const next = crypto.randomUUID();
  h.deliver({ type: "xdde-image:export", requestId: next });
  await flush();
  expect(h.post).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: "xdde-image:result",
      requestId: next,
      molecule: { smiles: "Nc1ccccc1", molfile: "M  END\n" },
    }),
    "http://127.0.0.1:4322",
  );
  expect(h.host.recognize).not.toHaveBeenCalled();
  h.bridge.dispose();
  const count = h.post.mock.calls.length;
  late({ smiles: "old result", molfile: "M  END\n" });
  await flush();
  expect(h.post.mock.calls).toHaveLength(count);
});
function setup() {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const parent = frame.contentWindow!;
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: parent,
  });
  const post = vi.spyOn(parent, "postMessage");
  const file = new File(["transport fixture"], "stat6.png", {
    type: "image/png",
  });
  let selected: File | null = null,
    finish!: () => void,
    signal!: AbortSignal;
  const host: RecognitionHost = {
    selectFile: vi.fn().mockResolvedValue(true),
    file: () => selected,
    available: () => true,
    molecule: vi
      .fn()
      .mockResolvedValue({ smiles: "Nc1ccccc1", molfile: "M  END\n" }),
    subscribe: () => () => {},
    recognitionReady: vi.fn(() => true),
    loadMolecule: vi.fn(),
    recognize: vi.fn().mockImplementation((_file, currentSignal) => {
      signal = currentSignal;
      return new Promise<void>((done) => {
        finish = done;
      });
    }),
  };
  const bridge = attachRecognitionBridge(host, "http://127.0.0.1:4322");
  const id = crypto.randomUUID(),
    requestId = crypto.randomUUID();
  const deliver = (data: object) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://127.0.0.1:4322",
        source: parent,
        data: { id, ...data },
      }),
    );
  return {
    bridge,
    host,
    post,
    file,
    requestId,
    deliver,
    commit: () => {
      selected = file;
      bridge.publish();
    },
    replace: (next: File) => {
      selected = next;
      bridge.publish();
    },
    finish: () => finish(),
    signal: () => signal,
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it("connect only stages an image; committed file lease and explicit foreground request are required", async () => {
  const h = setup();
  h.deliver({ type: "xdde-image:connect", file: h.file });
  await flush();
  expect(h.host.recognize).not.toHaveBeenCalled();
  expect(h.post).toHaveBeenLastCalledWith(
    expect.objectContaining({ valid: false }),
    "http://127.0.0.1:4322",
  );
  h.commit();
  h.deliver({ type: "xdde-image:recognize", requestId: h.requestId });
  await flush();
  h.deliver({ type: "xdde-image:recognize", requestId: h.requestId });
  expect(h.host.recognize).toHaveBeenCalledOnce();
  expect(h.post).toHaveBeenLastCalledWith(
    expect.objectContaining({ recognitionPhase: "working", valid: false }),
    "http://127.0.0.1:4322",
  );
  h.finish();
  await flush();
  expect(h.post).toHaveBeenLastCalledWith(
    expect.objectContaining({ recognitionPhase: "ready", valid: true }),
    "http://127.0.0.1:4322",
  );
  h.bridge.dispose();
});

it("refuses OCR when the service stops after connection and publishes its actual state", async () => {
  const h = setup();
  h.deliver({ type: "xdde-image:connect", file: h.file });
  await flush();
  h.commit();
  expect(h.post).toHaveBeenLastCalledWith(
    expect.objectContaining({ recognitionServiceReady: true }),
    "http://127.0.0.1:4322",
  );
  h.host.recognitionReady = () => false;
  h.deliver({ type: "xdde-image:recognize", requestId: h.requestId });
  expect(h.host.recognize).not.toHaveBeenCalled();
  expect(h.post).toHaveBeenLastCalledWith(
    expect.objectContaining({
      recognitionServiceReady: false,
      recognitionPhase: "failed",
    }),
    "http://127.0.0.1:4322",
  );
  h.bridge.dispose();
});

it("recognizes the image selected in the editor after a source replacement", async () => {
  const h = setup();
  h.deliver({ type: "xdde-image:connect", file: h.file });
  await flush();
  h.commit();
  const replacement = new File(["replacement"], "replacement.png", {
    type: "image/png",
  });
  h.replace(replacement);
  h.deliver({ type: "xdde-image:recognize", requestId: h.requestId });
  expect(h.host.recognize).toHaveBeenCalledExactlyOnceWith(
    replacement,
    expect.any(AbortSignal),
  );
  h.bridge.dispose();
});

it("cancel invalidates only its exact import request and late completion cannot become ready", async () => {
  const h = setup();
  h.deliver({ type: "xdde-image:connect", file: h.file });
  await flush();
  h.commit();
  h.deliver({ type: "xdde-image:recognize", requestId: h.requestId });
  await flush();
  h.deliver({ type: "xdde-image:cancel", requestId: crypto.randomUUID() });
  expect(h.signal().aborted).toBe(false);
  h.deliver({ type: "xdde-image:cancel", requestId: h.requestId });
  expect(h.signal().aborted).toBe(true);
  h.post.mockClear();
  h.finish();
  await flush();
  expect(h.post).not.toHaveBeenCalled();
  h.bridge.dispose();
});

it("loads an explicit edited graph without starting OCR", async () => {
  const h = setup(),
    molecule = { smiles: "Nc1ccccc1", molfile: "M  END\n" };
  h.deliver({
    type: "xdde-image:connect",
    file: h.file,
    initialMolecule: molecule,
  });
  await flush();
  expect(h.host.loadMolecule).toHaveBeenCalledExactlyOnceWith(molecule);
  expect(h.host.recognize).not.toHaveBeenCalled();
  h.bridge.dispose();
});
