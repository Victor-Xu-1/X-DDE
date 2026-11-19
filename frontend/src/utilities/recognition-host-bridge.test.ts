import { afterEach, expect, it, vi } from "vitest";
import {
  attachRecognitionBridge,
  type RecognitionHost,
} from "./recognition-host-bridge";
const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent")!;
afterEach(() => {
  Object.defineProperty(window, "parent", parentDescriptor);
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
it("never enables recognition and rejects a molecular export changed during serialization", async () => {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const parent = frame.contentWindow!;
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: parent,
  });
  const send = vi.spyOn(parent, "postMessage");
  const file = new File(["png"], "input.png", { type: "image/png" });
  let changed = () => {},
    complete!: (value: { smiles: string; molfile: string }) => void;
  const host: RecognitionHost = {
    selectFile: vi.fn().mockResolvedValue(true),
    file: () => file,
    available: () => true,
    molecule: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    subscribe: (callback) => {
      changed = callback;
      return vi.fn();
    },
  };
  const bridge = attachRecognitionBridge(host, "http://127.0.0.1:4322");
  const id = crypto.randomUUID(),
    requestId = crypto.randomUUID();
  const deliver = (data: object, origin = "http://127.0.0.1:4322") =>
    window.dispatchEvent(
      new MessageEvent("message", { origin, source: parent, data }),
    );
  deliver(
    { type: "xdde-image:connect", id, file },
    "https://untrusted.example",
  );
  expect(host.selectFile).not.toHaveBeenCalled();
  deliver({ type: "xdde-image:connect", id, file });
  await Promise.resolve();
  await Promise.resolve();
  expect(host.selectFile).toHaveBeenCalledExactlyOnceWith(file);
  deliver({ type: "xdde-image:export", id, requestId });
  changed();
  complete({ smiles: "CC(=O)Oc1ccccc1C(=O)O", molfile: "M  END" });
  await vi.waitFor(() =>
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "xdde-image:result", molecule: null }),
      "http://127.0.0.1:4322",
    ),
  );
  bridge.dispose();
});

it("exports the current valid drawing on request without opening the recognition path", async () => {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const parent = frame.contentWindow!;
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: parent,
  });
  const send = vi.spyOn(parent, "postMessage").mockImplementation(() => {});
  const origin = "http://127.0.0.1:4322";
  const id = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const molecule = { smiles: "CCO", molfile: "M  END\n" };
  const host: RecognitionHost = {
    selectFile: vi.fn(),
    file: () => null,
    available: () => true,
    molecule: vi.fn().mockResolvedValue(molecule),
    recognize: vi.fn(),
    subscribe: () => () => {},
  };
  const bridge = attachRecognitionBridge(host, origin, "drawing");
  const deliver = (data: object) => {
    window.dispatchEvent(
      new MessageEvent("message", { origin, source: parent, data }),
    );
  };
  deliver({ type: "xdde-drawing:connect", id });
  expect(send).toHaveBeenLastCalledWith(
    { type: "xdde-drawing:state", id, available: true },
    origin,
  );
  deliver({
    type: "xdde-image:connect",
    id,
    file: new File(["png"], "image.png", { type: "image/png" }),
  });
  deliver({ type: "xdde-image:recognize", id, requestId });
  expect(host.selectFile).not.toHaveBeenCalled();
  expect(host.recognize).not.toHaveBeenCalled();
  expect(host.molecule).not.toHaveBeenCalled();
  deliver({ type: "xdde-drawing:export", id, requestId });
  await vi.waitFor(() =>
    expect(send).toHaveBeenLastCalledWith(
      { type: "xdde-drawing:result", id, requestId, molecule },
      origin,
    ),
  );
  bridge.dispose();
});
