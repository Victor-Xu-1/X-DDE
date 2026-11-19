import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRecognitionBridge } from "./useRecognitionBridge";
import { recognitionOrigin, type ImageMolecule } from "./image-molecule";

const file = new File(["transport fixture"], "stat6.png", {
  type: "image/png",
});
function Harness({
  accept,
  automatic = true,
}: {
  accept(value: ImageMolecule, source: File): void;
  automatic?: boolean;
}) {
  const bridge = useRecognitionBridge(file, "en", accept, { automatic });
  return (
    <>
      <iframe title="Native image input" ref={bridge.frame} />
      <button onClick={bridge.connect}>Connect</button>
      <output>{bridge.phase}</output>
      <span>{bridge.error}</span>
      <button onClick={bridge.recognize}>Retry</button>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function setup(automatic = true) {
  const accept = vi.fn(),
    view = render(<Harness accept={accept} automatic={automatic} />);
  const frame = screen.getByTitle("Native image input") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  fireEvent.click(screen.getByText("Connect"));
  const id = post.mock.calls[0][0].id;
  const message = (data: object) =>
    fireEvent(
      window,
      new MessageEvent("message", {
        origin: recognitionOrigin(),
        source: frame.contentWindow,
        data: {
          type: "xdde-image:state",
          id,
          recognitionServiceReady: true,
          ...data,
        },
      }),
    );
  const calls = (type: string) =>
    post.mock.calls.filter(([data]) => data.type === type);
  return {
    accept,
    view,
    post,
    id,
    message,
    calls,
  };
}
it("cancels the active recognition request when the editor closes", () => {
  const h = setup(false);
  h.message({ recognitionSupported: true, valid: false });
  fireEvent.click(screen.getByText("Retry"));
  const requestId = h.calls("xdde-image:recognize")[0][0].requestId;
  h.view.unmount();
  expect(h.calls("xdde-image:cancel")[0][0].requestId).toBe(requestId);
});
it("waits for explicit service readiness, recognizes once and never trusts a stale request", async () => {
  const h = setup();
  expect(h.calls("xdde-image:recognize")).toHaveLength(0);
  h.message({
    recognitionSupported: true,
    recognitionServiceReady: false,
    valid: false,
  });
  fireEvent.click(screen.getByText("Retry"));
  expect(h.calls("xdde-image:recognize")).toHaveLength(0);
  h.message({ recognitionSupported: true, valid: false });
  h.message({ recognitionSupported: true, valid: false });
  expect(h.calls("xdde-image:recognize")).toHaveLength(1);
  const requestId = h.calls("xdde-image:recognize")[0][0].requestId;
  h.message({
    recognitionSupported: true,
    valid: true,
    recognitionRequestId: "old",
    recognitionPhase: "ready",
  });
  expect(h.calls("xdde-image:export")).toHaveLength(0);
  h.message({
    recognitionSupported: true,
    valid: true,
    recognitionRequestId: requestId,
    recognitionPhase: "ready",
  });
  h.message({
    recognitionSupported: true,
    valid: true,
    recognitionRequestId: requestId,
    recognitionPhase: "ready",
  });
  expect(h.calls("xdde-image:export")).toHaveLength(1);
  const exportId = h.calls("xdde-image:export")[0][0].requestId;
  const molecule = { smiles: "Nc1ccccc1", molfile: "M  END\n" };
  await act(async () =>
    h.message({
      type: "xdde-image:result",
      requestId: exportId,
      molecule,
      source: file,
    }),
  );
  expect(h.accept).toHaveBeenCalledExactlyOnceWith(molecule, file);
});
it("manual mode never automatically starts OCR", () => {
  const h = setup(false);
  h.message({ recognitionSupported: true, valid: true });
  expect(h.calls("xdde-image:recognize")).toHaveLength(0);
});
it("an unsupported host never automatically starts OCR", () => {
  const h = setup();
  h.message({ recognitionSupported: false, valid: true });
  expect(h.calls("xdde-image:recognize")).toHaveLength(0);
});

it("keeps older hosts manual when their bridge cannot report service readiness", () => {
  const h = setup();
  h.message({
    recognitionSupported: true,
    recognitionServiceReady: undefined,
    valid: false,
  });
  expect(h.calls("xdde-image:recognize")).toHaveLength(0);
});
it("timeout cancels the exact import, offers retry, and unmount cancels without a power command", () => {
  vi.useFakeTimers();
  const h = setup();
  h.message({ recognitionSupported: true, valid: false });
  const first = h.calls("xdde-image:recognize")[0][0].requestId;
  act(() => vi.advanceTimersByTime(180000));
  expect(h.calls("xdde-image:cancel")[0][0].requestId).toBe(first);
  expect(screen.getByText(/Recognition timed out/)).toBeVisible();
  fireEvent.click(screen.getByText("Retry"));
  expect(h.calls("xdde-image:recognize")).toHaveLength(2);
  h.view.unmount();
  expect(h.calls("xdde-image:cancel")).toHaveLength(2);
  expect(
    h.post.mock.calls.every(([data]) => !String(data.type).includes("power")),
  ).toBe(true);
});
