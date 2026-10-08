import { expect, it, vi } from "vitest";
import { renderWithin } from "./render-deadline";
it("bounds a stalled renderer and removes its timer after a native completion", async () => {
  vi.useFakeTimers();
  try {
    const result = renderWithin(
      new Promise<Blob>(() => {}),
      new AbortController().signal,
      30,
    );
    const assertion = expect(result).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(31);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
    expect(
      await renderWithin(
        Promise.resolve("native"),
        new AbortController().signal,
      ),
    ).toBe("native");
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("cancels waiting when the view closes, including a later native failure", async () => {
  const abort = new AbortController();
  let fail!: (error: Error) => void;
  const pending = renderWithin(
    new Promise<string>((_, reject) => {
      fail = reject;
    }),
    abort.signal,
  );
  const assertion = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  abort.abort();
  await assertion;
  fail(new Error("Late native failure"));
  await Promise.resolve();
});
