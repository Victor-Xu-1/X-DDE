import { expect, it, vi } from "vitest";
import {
  FigureRenderQueue,
  figureIdentity,
  type FigureSource,
} from "./figure-render-queue";
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
    queue = new FigureRenderQueue();
  const source = { key: "source-A", render: native, onStart: before };
  const first = queue.request(
    defaultFigure,
    source,
    new AbortController().signal,
  );
  await vi.waitFor(() => expect(native).toHaveBeenCalledOnce());
  const skipped = queue.request(
    { ...defaultFigure, fontPt: 8 },
    source,
    new AbortController().signal,
  );
  const rejection = expect(skipped).rejects.toMatchObject({
    name: "AbortError",
  });
  const last = queue.request(
    { ...defaultFigure, fontPt: 9 },
    source,
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
  const queue = new FigureRenderQueue(),
    first = new AbortController();
  const source = { key: "source-A", render: native };
  const waiting = queue.request(defaultFigure, source, first.signal);
  await vi.waitFor(() => expect(native).toHaveBeenCalledOnce());
  const rejected = expect(waiting).rejects.toMatchObject({
    name: "AbortError",
  });
  first.abort();
  const stillActive = queue.request(
    defaultFigure,
    source,
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
  const queue = new FigureRenderQueue();
  const source = { key: "source-A", render: native };
  const first = queue.request(
    defaultFigure,
    source,
    new AbortController().signal,
  );
  await vi.waitFor(() => expect(native).toHaveBeenCalledOnce());
  const pending = queue.request(
    { ...defaultFigure, fontPt: 8 },
    source,
    new AbortController().signal,
  );
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  const current = queue.request(
    defaultFigure,
    source,
    new AbortController().signal,
  );
  finish(image());
  await Promise.all([first, current, rejected]);
  expect(native).toHaveBeenCalledOnce();
});

it("does not reuse another source's active bytes when settings are identical", async () => {
  let finish!: (blob: Blob) => void;
  const oldRender = vi.fn(
    () => new Promise<Blob>((resolve) => (finish = resolve)),
  );
  const nextBlob = new Blob(["source-B"], { type: "image/svg+xml" });
  const nextRender = vi.fn(async () => nextBlob);
  const oldStart = vi.fn(),
    nextStart = vi.fn();
  const queue = new FigureRenderQueue(),
    aborted = new AbortController();
  const first = queue.request(
    defaultFigure,
    { key: "source-A", render: oldRender, onStart: oldStart },
    aborted.signal,
  );
  const cancelled = expect(first).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(oldRender).toHaveBeenCalledOnce());
  aborted.abort();
  const second = queue.request(
    defaultFigure,
    { key: "source-B", render: nextRender, onStart: nextStart },
    new AbortController().signal,
  );
  expect(nextRender).not.toHaveBeenCalled();
  finish(image());
  await cancelled;
  await expect(second).resolves.toBe(nextBlob);
  expect(oldStart).toHaveBeenCalledOnce();
  expect(nextStart).toHaveBeenCalledOnce();
});

it("captures the requested renderer rather than a later mutation of its source descriptor", async () => {
  const queue = new FigureRenderQueue();
  const original = image(),
    native = vi.fn(async () => original);
  const source: FigureSource = { key: "source-A", render: native };
  const output = queue.request(
    defaultFigure,
    source,
    new AbortController().signal,
  );
  const replacement = vi.fn(async () => new Blob(["wrong source"]));
  source.key = "source-B";
  source.render = replacement;
  await expect(output).resolves.toBe(original);
  expect(replacement).not.toHaveBeenCalled();
});

it("keeps source identities distinct and avoids exponential growth from nested contexts", () => {
  expect(figureIdentity("A:[]", "B")).not.toBe(figureIdentity("A", ":[]B"));
  let key = '"\\\n'.repeat(1000);
  const initialLength = key.length;
  for (let index = 0; index < 4; index++) key = figureIdentity(key, index);
  expect(key.length).toBeLessThan(initialLength + 100);
});
