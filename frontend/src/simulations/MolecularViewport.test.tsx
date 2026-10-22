import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MolecularViewport } from "./MolecularViewport";

const { display, dispose, seek } = vi.hoisted(() => ({
  display: vi.fn(),
  dispose: vi.fn(),
  seek: vi.fn(),
}));
vi.mock("./molstar-controller", () => ({
  MolecularController: class {
    surfaceSummary = null;
    initialize = async () => {};
    load = async () => {};
    setView = display;
    setFrame = seek;
    dispose = dispose;
    cameraSnapshot = () => undefined;
    restoreCamera = () => {};
    figure = async () => new Blob();
  },
}));
vi.mock("./molecular-view-state", () => ({ visibleViewport: async () => {} }));
vi.mock("../publication/FigureExport", () => ({
  FigureExport: ({ disabled }: { disabled: boolean }) => (
    <button disabled={disabled}>Download view</button>
  ),
}));
vi.mock("../viewer/SurfaceLegend", () => ({
  SurfaceLegend: () => <p>Native surface legend</p>,
}));

beforeEach(() => {
  seek.mockImplementation(async (_index: number, confirmed: () => void) =>
    confirmed(),
  );
});
afterEach(() => {
  cleanup();
  display.mockReset();
  dispose.mockReset();
  seek.mockReset();
});

it("keeps frame capture unavailable until the requested native frame is confirmed", async () => {
  display.mockResolvedValue(undefined);
  const handles = vi.fn(),
    ready = vi.fn(),
    frames = ["/frame-0.pdb", "/frame-1.pdb"];
  const page = render(
    <MolecularViewport
      language="en"
      frames={frames}
      frame={0}
      onViewHandle={handles}
      onReady={ready}
    />,
  );
  const download = screen.getByRole("button", { name: "Download view" });
  await waitFor(() => {
    expect(download).toBeEnabled();
    expect(ready.mock.lastCall?.[0]).toBe(true);
    expect(handles.mock.lastCall?.[0]?.capture).toEqual(expect.any(Function));
  });
  const previous = handles.mock.lastCall![0];
  let finish!: () => void;
  seek.mockImplementationOnce(
    (_index: number, confirmed: () => void) =>
      new Promise<void>((resolve) => {
        finish = () => {
          confirmed();
          resolve();
        };
      }),
  );
  page.rerender(
    <MolecularViewport
      language="en"
      frames={frames}
      frame={1}
      onViewHandle={handles}
      onReady={ready}
    />,
  );
  expect(download).toBeDisabled();
  expect(screen.getByTestId("molstar-viewport")).toHaveAttribute(
    "data-frame",
    "0",
  );
  expect(ready.mock.lastCall![0]).toBe(false);
  expect(handles.mock.lastCall![0]).toBeNull();
  expect(() => previous.capture({})).toThrow("not ready");
  await act(async () => finish());
  await waitFor(() => expect(download).toBeEnabled());
  expect(screen.getByTestId("molstar-viewport")).toHaveAttribute(
    "data-frame",
    "1",
  );
  expect(ready.mock.lastCall![0]).toBe(true);
});

it("offers explicit retry for a failed trajectory frame without publishing the failed frame", async () => {
  display.mockResolvedValue(undefined);
  const frames = ["/frame-0.pdb", "/frame-1.pdb"];
  const page = render(
    <MolecularViewport language="en" frames={frames} frame={0} />,
  );
  const download = screen.getByRole("button", { name: "Download view" });
  await waitFor(() => expect(download).toBeEnabled());
  seek.mockRejectedValueOnce(new Error("Native frame update failed"));
  page.rerender(<MolecularViewport language="en" frames={frames} frame={1} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "view update failed",
  );
  expect(download).toBeDisabled();
  expect(screen.getByTestId("molstar-viewport")).toHaveAttribute(
    "data-frame",
    "0",
  );
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(download).toBeEnabled());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByTestId("molstar-viewport")).toHaveAttribute(
    "data-frame",
    "1",
  );
});

it("ignores a late superseded frame instead of replacing the latest confirmed frame", async () => {
  display.mockResolvedValue(undefined);
  const frames = ["/frame-0.pdb", "/frame-1.pdb", "/frame-2.pdb"];
  const page = render(
    <MolecularViewport language="en" frames={frames} frame={0} />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Download view" })).toBeEnabled(),
  );
  let finish!: () => void;
  seek.mockImplementationOnce(
    (_index: number, confirmed: () => void) =>
      new Promise<void>((resolve) => {
        finish = () => {
          confirmed();
          resolve();
        };
      }),
  );
  page.rerender(<MolecularViewport language="en" frames={frames} frame={1} />);
  page.rerender(<MolecularViewport language="en" frames={frames} frame={2} />);
  await waitFor(() =>
    expect(screen.getByTestId("molstar-viewport")).toHaveAttribute(
      "data-frame",
      "2",
    ),
  );
  await act(async () => finish());
  expect(screen.getByTestId("molstar-viewport")).toHaveAttribute(
    "data-frame",
    "2",
  );
  expect(screen.getByRole("button", { name: "Download view" })).toBeEnabled();
});

it("surface requests disable capture until their exact display is ready", async () => {
  display.mockResolvedValue(undefined);
  const handles = vi.fn();
  render(<MolecularViewport language="en" onViewHandle={handles} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Download view" })).toBeEnabled(),
  );
  let finish!: () => void;
  display.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Surface" }));
  expect(screen.getByRole("status")).toHaveTextContent("Updating the 3D view");
  expect(screen.getByRole("button", { name: "Download view" })).toBeDisabled();
  expect(handles.mock.lastCall![0]).toBeNull();
  await act(async () => finish());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Download view" })).toBeEnabled(),
  );
  expect(handles.mock.lastCall![0]).not.toBeNull();
});

it("a failed native display request is visible and cannot enable an inaccurate figure export", async () => {
  display.mockResolvedValue(undefined);
  render(<MolecularViewport language="en" />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Download view" })).toBeEnabled(),
  );
  display.mockRejectedValueOnce(new Error("native failure"));
  await userEvent.click(screen.getByRole("button", { name: "Surface" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "view update failed",
  );
  expect(screen.getByRole("button", { name: "Download view" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Surface" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Download view" })).toBeEnabled(),
  );
});
