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
  expect(image.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
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
  expect(URL.createObjectURL).not.toHaveBeenCalled();
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
it("magnifies and resets viewing without changing the native render, paper settings or download", async () => {
  const native = vi.fn(async () => vector());
  render(
    <FigureExport
      language="en"
      filename="native-figure"
      format="svg"
      render={native}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Export figure/ }));
  const image = await screen.findByRole("img");
  expect(
    screen.getByRole("button", { name: "Zoom in preview" }),
  ).toBeDisabled();
  fireEvent.load(image);
  const source = image.getAttribute("src");
  for (let n = 0; n < 3; n++)
    fireEvent.click(screen.getByRole("button", { name: "Zoom in preview" }));
  expect(screen.getByRole("region", { name: "Figure canvas" })).toHaveAttribute(
    "data-zoom",
    "4",
  );
  expect(
    screen.getByRole("button", { name: "Zoom in preview" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Zoom out preview" }));
  expect(screen.getByRole("region", { name: "Figure canvas" })).toHaveAttribute(
    "data-zoom",
    "3",
  );
  fireEvent.click(screen.getByRole("button", { name: "Fit preview" }));
  expect(screen.getByRole("region", { name: "Figure canvas" })).toHaveAttribute(
    "data-zoom",
    "1",
  );
  expect(image.getAttribute("src")).toBe(source);
  expect(native).toHaveBeenCalledExactlyOnceWith(defaultFigure);
  fireEvent.click(screen.getByRole("button", { name: "Export SVG" }));
  expect(download).toHaveBeenCalledExactlyOnceWith(
    await native.mock.results[0].value,
    "native-figure.svg",
  );
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
it("offers a wider layout without exporting or silently shrinking a molecular figure", async () => {
  const native = vi.fn(async (settings: typeof defaultFigure) => {
    if (settings.widthMm === 89) {
      const error = new Error("Needs wider paper");
      error.name = "MolecularLayoutError";
      throw error;
    }
    return vector();
  });
  render(
    <FigureExport
      language="en"
      filename="molecule"
      format="svg"
      render={native}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Export figure/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose double column",
  );
  expect(screen.getByRole("button", { name: "Export SVG" })).toBeDisabled();
  expect(download).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Figure width"), {
    target: { value: "183" },
  });
  fireEvent.load(await screen.findByRole("img"));
  fireEvent.click(screen.getByRole("button", { name: "Export SVG" }));
  expect(native.mock.calls.at(-1)?.[0]).toEqual({
    ...defaultFigure,
    widthMm: 183,
  });
  expect(download).toHaveBeenCalledOnce();
});
it("keeps a decode failure unavailable until a newly rendered preview loads", async () => {
  const native = vi.fn(async () => vector());
  render(
    <FigureExport
      language="en"
      filename="result"
      format="svg"
      render={native}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Export figure/ }));
  const oldImage = await screen.findByRole("img");
  fireEvent.error(oldImage);
  expect(screen.getByRole("button", { name: "Export SVG" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
  const nextImage = await screen.findByRole("img");
  expect(nextImage).not.toBe(oldImage);
  fireEvent.load(oldImage);
  expect(screen.getByRole("button", { name: "Export SVG" })).toBeDisabled();
  fireEvent.load(nextImage);
  fireEvent.click(screen.getByRole("button", { name: "Export SVG" }));
  expect(download).toHaveBeenCalledOnce();
});
