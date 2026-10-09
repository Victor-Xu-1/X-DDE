import { expect, it, vi } from "vitest";
import { FigureRenderQueue } from "./figure-render-queue";
import { defaultFigure } from "./settings";
const image = () => new Blob(["native"], { type: "image/svg+xml" });
it("serializes native captures and renders only the latest pending settings", async () => {
  let finish!: (blob: Blob) => void;
  const native = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(image());
  const before = vi.fn(),
    queue = new FigureRenderQueue(native, before);
  const first = queue.request(defaultFigure, new AbortController().signal);
  await vi.waitFor(() => expect(native).toHaveBeenCalledOnce());
  const skipped = queue.request(
    { ...defaultFigure, fontPt: 8 },
    new AbortController().signal,
  );
  const rejection = expect(skipped).rejects.toMatchObject({
    name: "AbortError",
  });
  const last = queue.request(
    { ...defaultFigure, fontPt: 9 },
    new AbortController().signal,
  );
  expect(native).toHaveBeenCalledOnce();
  finish(image());
  await Promise.all([first, last, rejection]);
  expect(native).toHaveBeenCalledTimes(2);
  expect(native).toHaveBeenLastCalledWith({ ...defaultFigure, fontPt: 9 });
  expect(before).toHaveBeenCalledOnce();
});
it("cancelling a waiter never releases or duplicates an active native capture", async () => {
  let finish!: (blob: Blob) => void;
  const native = vi.fn(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
  );
  const queue = new FigureRenderQueue(native),
    first = new AbortController();
  const waiting = queue.request(defaultFigure, first.signal);
  await vi.waitFor(() => expect(native).toHaveBeenCalledOnce());
  const rejected = expect(waiting).rejects.toMatchObject({
    name: "AbortError",
  });
  first.abort();
  const stillActive = queue.request(
    defaultFigure,
    new AbortController().signal,
  );
  finish(image());
  await rejected;
  expect(await stillActive).toBeInstanceOf(Blob);
  expect(native).toHaveBeenCalledOnce();
});
it("returning to the active settings discards a superseded pending choice", async () => {
  let finish!: (blob: Blob) => void;
  const native = vi.fn(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
  );
  const queue = new FigureRenderQueue(native);
  const first = queue.request(defaultFigure, new AbortController().signal);
  await vi.waitFor(() => expect(native).toHaveBeenCalledOnce());
  const pending = queue.request(
    { ...defaultFigure, fontPt: 8 },
    new AbortController().signal,
  );
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  const current = queue.request(defaultFigure, new AbortController().signal);
  finish(image());
  await Promise.all([first, current, rejected]);
  expect(native).toHaveBeenCalledOnce();
});
