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
