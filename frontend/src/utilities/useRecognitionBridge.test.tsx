import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useRecognitionBridge } from "./useRecognitionBridge";
import { recognitionOrigin, type ImageMolecule } from "./image-molecule";
const source = new File(["image transport fixture"], "structure.png", {
  type: "image/png",
});
const molecule = {
  smiles: "CC(=O)Oc1ccccc1C(=O)O",
  molfile: "protocol-only export\nM  END\n",
};
function Harness({
  accept,
}: {
  accept(value: ImageMolecule, source: File): void;
}) {
  const bridge = useRecognitionBridge(source, "en", accept);
  return (
    <>
      <iframe title="Recognition" ref={bridge.frame} />
      <button onClick={bridge.connect}>Connect</button>
      <button disabled={!bridge.valid || bridge.busy} onClick={bridge.accept}>
        Use molecule
      </button>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("accepts only the current frame, exact local origin and current export request", async () => {
  const accept = vi.fn(),
    user = userEvent.setup();
  render(<Harness accept={accept} />);
  const frame = screen.getByTitle("Recognition") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  await user.click(screen.getByText("Connect"));
  const connect = post.mock.calls[0][0];
  function message(
    data: object,
    origin = recognitionOrigin(),
    sender = frame.contentWindow,
  ) {
    fireEvent(
      window,
      new MessageEvent("message", { origin, source: sender, data }),
    );
  }
  message(
    { type: "xdde-image:state", id: connect.id, valid: true },
    "https://untrusted.example",
  );
  expect(screen.getByText("Use molecule")).toBeDisabled();
  message(
    { type: "xdde-image:state", id: connect.id, valid: true },
    recognitionOrigin(),
    window,
  );
  expect(screen.getByText("Use molecule")).toBeDisabled();
  message({ type: "xdde-image:state", id: connect.id, valid: true });
  await user.click(screen.getByText("Use molecule"));
  const request = post.mock.calls.at(-1)![0];
  message({
    type: "xdde-image:result",
    id: connect.id,
    requestId: "old",
    molecule,
    source,
  });
  expect(accept).not.toHaveBeenCalled();
  await act(async () =>
    message({
      type: "xdde-image:result",
      id: connect.id,
      requestId: request.requestId,
      molecule,
      source,
    }),
  );
  expect(accept).toHaveBeenCalledExactlyOnceWith(molecule, source);
  await act(async () =>
    message({
      type: "xdde-image:result",
      id: connect.id,
      requestId: request.requestId,
      molecule,
      source,
    }),
  );
  expect(accept).toHaveBeenCalledTimes(1);
});
it("does not apply a late structure after its input is removed", async () => {
  const accept = vi.fn(),
    user = userEvent.setup();
  const view = render(<Harness accept={accept} />);
  const frame = screen.getByTitle("Recognition") as HTMLIFrameElement;
  const sender = frame.contentWindow!,
    post = vi.spyOn(sender, "postMessage");
  await user.click(screen.getByText("Connect"));
  const connect = post.mock.calls[0][0];
  fireEvent(
    window,
    new MessageEvent("message", {
      origin: recognitionOrigin(),
      source: sender,
      data: { type: "xdde-image:state", id: connect.id, valid: true },
    }),
  );
  await user.click(screen.getByText("Use molecule"));
  const request = post.mock.calls.at(-1)![0];
  view.unmount();
  fireEvent(
    window,
    new MessageEvent("message", {
      origin: recognitionOrigin(),
      source: sender,
      data: {
        type: "xdde-image:result",
        id: connect.id,
        requestId: request.requestId,
        molecule,
        source,
      },
    }),
  );
  expect(accept).not.toHaveBeenCalled();
});
