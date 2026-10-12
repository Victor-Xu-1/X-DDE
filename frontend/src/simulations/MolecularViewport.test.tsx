import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MolecularViewport } from "./MolecularViewport";

const { display, dispose } = vi.hoisted(() => ({
  display: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("./molstar-controller", () => ({
  MolecularController: class {
    surfaceSummary = null;
    initialize = async () => {};
    load = async () => {};
    setView = display;
    setFrame = async () => {};
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
afterEach(() => {
  cleanup();
  display.mockReset();
  dispose.mockReset();
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
