import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FigureExport } from "./FigureExport";
import { defaultFigure } from "./settings";
const download = vi.hoisted(() => vi.fn());
vi.mock("../presentation/visual-export", () => ({ downloadBlob: download }));
// Protocol fixtures only; native browser acceptance inspects actual molecular/vector/pixel content.
const vector = () =>
  new Blob(
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1L9 9"/></svg>',
    ],
    { type: "image/svg+xml" },
  );
beforeEach(() => {
  download.mockClear();
  let count = 0;
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:figure-" + ++count),
    revokeObjectURL: vi.fn(),
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("previews and downloads identical native bytes without rendering again", async () => {
  const native = vi.fn(async () => vector()),
    onStart = vi.fn();
  render(
    <FigureExport
      language="en"
      filename="native-RMSD"
      format="svg"
      render={native}
      onStart={onStart}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Export figure/ }));
  expect(screen.getByRole("dialog")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Printed type size"), {
    target: { value: "8" },
  });
  const image = await screen.findByRole("img", {
    name: "Native figure with the selected settings",
  });
  expect(screen.getByRole("button", { name: "Export SVG" })).toBeDisabled();
  fireEvent.load(image);
  fireEvent.click(screen.getByRole("button", { name: "Export SVG" }));
  const blob = await native.mock.results[0].value;
  expect(download).toHaveBeenCalledExactlyOnceWith(blob, "native-RMSD.svg");
  expect(native).toHaveBeenCalledExactlyOnceWith({
    ...defaultFigure,
    fontPt: 8,
  });
  expect(onStart).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it("refuses an incorrect native format and supports an explicit preview retry", async () => {
  const native = vi
    .fn()
    .mockResolvedValueOnce(new Blob(["wrong"], { type: "text/html" }))
    .mockResolvedValue(vector());
  render(
    <FigureExport
      language="zh"
      filename="result"
      format="svg"
      render={native}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /文献图导出/ }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "导出 SVG" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重新生成预览" }));
  const image = await screen.findByRole("img", {
    name: "当前参数生成的原生图件",
  });
  fireEvent.load(image);
  fireEvent.click(screen.getByRole("button", { name: "导出 SVG" }));
  expect(download).toHaveBeenCalledOnce();
});
it("never publishes late preview bytes after the dialog closes", async () => {
  let finish!: (blob: Blob) => void;
  const native = vi.fn(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <FigureExport
      language="en"
      filename="result"
      format="svg"
      render={native}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Export figure/ }));
  await waitFor(() => expect(native).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: /Export figure/ })).toBeDisabled();
  await act(async () => {
    finish(vector());
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Export figure/ })).toBeEnabled(),
  );
  expect(download).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
