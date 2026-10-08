import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FigureExport } from "./FigureExport";
import { defaultFigure } from "./settings";
const download = vi.hoisted(() => vi.fn());
vi.mock("../presentation/visual-export", () => ({ downloadBlob: download }));
beforeEach(() => {
  download.mockClear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
it("uses clear print choices, calls the native renderer and downloads only its result", async () => {
  const renderFigure = vi.fn(
    async () => new Blob(["<svg/>"], { type: "image/svg+xml" }),
  );
  const onStart = vi.fn();
  render(
    <FigureExport
      language="en"
      filename="native-RMSD"
      format="svg"
      render={renderFigure}
      onStart={onStart}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Export figure/ }));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByLabelText("Figure width")).toHaveValue("89");
  fireEvent.change(screen.getByLabelText("Printed type size"), {
    target: { value: "8" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export SVG" }));
  await waitFor(() =>
    expect(download).toHaveBeenCalledWith(expect.any(Blob), "native-RMSD.svg"),
  );
  expect(onStart).toHaveBeenCalledOnce();
  expect(renderFigure).toHaveBeenCalledWith({ ...defaultFigure, fontPt: 8 });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("shows a real failure, remains retryable and refuses incorrect native formats", async () => {
  const native = vi.fn(async () => new Blob(["wrong"], { type: "text/html" }));
  render(
    <FigureExport
      language="zh"
      filename="result"
      format="svg"
      render={native}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /文献图导出/ }));
  fireEvent.click(screen.getByRole("button", { name: "导出 SVG" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
  expect(screen.getByRole("button", { name: "导出 SVG" })).toBeEnabled();
  expect(download).not.toHaveBeenCalled();
});
it("prevents duplicate exports and never downloads after the source view is closed", async () => {
  let finish!: (blob: Blob) => void;
  const native = vi.fn(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <FigureExport
      language="en"
      filename="result"
      format="svg"
      render={native}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Export figure/ }));
  fireEvent.click(screen.getByRole("button", { name: "Export SVG" }));
  expect(screen.getByRole("button", { name: "Rendering… SVG" })).toBeDisabled();
  expect(native).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: /Export figure/ })).toBeDisabled();
  finish(new Blob(["<svg/>"], { type: "image/svg+xml" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Export figure/ })).toBeEnabled(),
  );
  expect(download).not.toHaveBeenCalled();
  view.unmount();
});
