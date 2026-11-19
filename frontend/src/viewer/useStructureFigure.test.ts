import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { defaultFigure } from "../publication/settings";
import {
  useStructureFigure,
  type StructureFigureHandle,
} from "./useStructureFigure";

it("replaces the renderer with the displayed source and rejects an in-flight old panel", async () => {
  let complete: (blob: Blob) => void = () => {};
  const png = new Blob([], { type: "image/png" });
  const delayed = new Promise<Blob>((resolve) => {
    complete = resolve;
  });
  const capture = vi.fn().mockReturnValueOnce(delayed).mockResolvedValue(png);
  const publish = vi.fn<(handle: StructureFigureHandle | null) => void>();
  const view = renderHook(
    ({ source, ready }) => useStructureFigure(source, ready, capture, publish),
    { initialProps: { source: "pose A", ready: true } },
  );
  const previous = publish.mock.lastCall![0]!;
  const size = { width: 444, height: 337 };
  const pending = previous.capture(defaultFigure, size);
  expect(capture).toHaveBeenCalledExactlyOnceWith(defaultFigure, size);
  view.rerender({ source: "pose B", ready: false });
  expect(publish.mock.lastCall![0]).toBeNull();
  complete(png);
  await expect(pending).rejects.toThrow("changed during export");
  await expect(previous.capture(defaultFigure, size)).rejects.toThrow(
    "changed during export",
  );
  view.rerender({ source: "pose B", ready: true });
  const current = publish.mock.lastCall![0]!;
  expect(current.sourceKey).toBe("pose B");
  await expect(current.capture(defaultFigure, size)).resolves.toBe(png);
});
