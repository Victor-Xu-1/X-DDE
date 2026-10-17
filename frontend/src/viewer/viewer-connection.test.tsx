import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { StructureViewer } from "./StructureViewer";
import { defaultOptions } from "./protocol";

const input = {
  sourceSnapshot: true,
  language: "en" as const,
  urls: [
    "/api/jobs/11111111-1111-4111-8111-111111111111/download?name=protein.pdb",
    "/api/jobs/11111111-1111-4111-8111-111111111111/download?name=native.sdf",
  ],
  records: [0, 2],
};
const scene = {
  atoms: 100,
  chains: ["A"],
  ligands: [],
  residues: [],
  hasPolymer: true,
  options: defaultOptions,
};
const iframe = () =>
  screen.getByTitle("Interactive molecular structure") as HTMLIFrameElement;
function emit(frame: HTMLIFrameElement, type: string, detail?: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: frame.contentWindow,
        data: { channel: "opendde-viewer", type, detail },
      }),
    );
  });
}
const ready = (frame: HTMLIFrameElement, instanceId: string) =>
  emit(frame, "ready", { instanceId });
const capture = () => screen.getByRole("button", { name: "Capture 3D view" });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("requests readiness after document load even if the first notification was missed", () => {
  render(<StructureViewer {...input} />);
  const frame = iframe();
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  fireEvent.load(frame);
  expect(post).toHaveBeenCalledWith(
    { channel: "opendde-viewer", type: "ready-request", value: undefined },
    location.origin,
  );
  expect(screen.queryByText(/Select a file or conformer/)).toBeNull();
  expect(capture()).toBeDisabled();
  ready(frame, "document-one");
  expect(post.mock.calls.filter(([data]) => data.type === "load")).toHaveLength(
    1,
  );
  emit(frame, "loaded", scene);
  expect(capture()).toBeEnabled();
});

it("reloads the exact native record after the same iframe window starts a new document", () => {
  const submit = vi.spyOn(api, "post");
  render(<StructureViewer {...input} />);
  const frame = iframe();
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  ready(frame, "document-one");
  emit(frame, "loaded", scene);
  const first = post.mock.calls.find(([data]) => data.type === "load")![0]
    .value;
  expect(capture()).toBeEnabled();
  fireEvent.load(frame);
  expect(capture()).toBeDisabled();
  ready(frame, "document-two");
  const loads = post.mock.calls.filter(([data]) => data.type === "load");
  expect(loads).toHaveLength(2);
  expect(loads[1][0].value).toEqual(first);
  expect(loads[1][0].value.records).toEqual([0, 2]);
  expect(loads[1][0].value.initialPosePrepared).toBe(true);
  emit(frame, "loaded", scene);
  expect(capture()).toBeEnabled();
  expect(submit).not.toHaveBeenCalled();
});

it("deduplicates notification and probe acknowledgements for one document", () => {
  render(<StructureViewer {...input} />);
  const frame = iframe();
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  ready(frame, "document-one");
  emit(frame, "loaded", scene);
  fireEvent.load(frame);
  ready(frame, "document-one");
  ready(frame, "document-one");
  expect(post.mock.calls.filter(([data]) => data.type === "load")).toHaveLength(
    1,
  );
  expect(capture()).toBeEnabled();
});

it("waits for reconnection and then loads the latest selected source only", () => {
  const { rerender } = render(<StructureViewer {...input} />);
  const frame = iframe();
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  ready(frame, "document-one");
  emit(frame, "loaded", scene);
  fireEvent.load(frame);
  rerender(<StructureViewer {...input} records={[0, 1]} />);
  expect(post.mock.calls.filter(([data]) => data.type === "load")).toHaveLength(
    1,
  );
  ready(frame, "document-two");
  const loads = post.mock.calls.filter(([data]) => data.type === "load");
  expect(loads).toHaveLength(2);
  expect(loads[1][0].value.urls).toEqual(input.urls);
  expect(loads[1][0].value.records).toEqual([0, 1]);
});

it("offers a bounded startup recovery without computing, cancelling or changing the pose", () => {
  vi.useFakeTimers();
  const submit = vi.spyOn(api, "post");
  const cancel = vi.spyOn(api, "cancel");
  render(<StructureViewer {...input} />);
  const previous = iframe();
  const staleWindow = previous.contentWindow;
  act(() => vi.advanceTimersByTime(30_001));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "3D preview could not start",
  );
  expect(capture()).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /^Reload$/ }));
  const current = iframe();
  expect(current).not.toBe(previous);
  const post = vi.spyOn(current.contentWindow!, "postMessage");
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: staleWindow,
        data: {
          channel: "opendde-viewer",
          type: "ready",
          detail: { instanceId: "stale-document" },
        },
      }),
    );
  });
  expect(post.mock.calls.some(([data]) => data.type === "load")).toBe(false);
  ready(current, "replacement-document");
  const request = post.mock.calls.find(([data]) => data.type === "load")![0]
    .value;
  expect(request.urls).toEqual(input.urls);
  expect(request.records).toEqual(input.records);
  emit(current, "loaded", scene);
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(capture()).toBeEnabled();
  expect(submit).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});

it("does not turn an empty viewer into a startup error", () => {
  vi.useFakeTimers();
  render(<StructureViewer sourceSnapshot urls={[]} language="en" />);
  act(() => vi.advanceTimersByTime(60_000));
  expect(screen.getByText(/Select a file or conformer/)).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});
