import { expect, it, vi } from "vitest";
import { ViewportLifetime } from "./viewport-lifetime";

function pending() {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

it("leaves in-flight native setup intact, then releases it once without starting later setup steps", async () => {
  const step = pending(),
    release = vi.fn(),
    later = vi.fn();
  const lifetime = new ViewportLifetime(release);
  const startup = lifetime.initialize(async (checkOpen) => {
    await step.promise;
    checkOpen();
    later();
  });
  const rejected = expect(startup).rejects.toMatchObject({
    name: "AbortError",
  });
  lifetime.close();
  lifetime.close();
  expect(release).not.toHaveBeenCalled();
  step.finish();
  await rejected;
  expect(later).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});

it("defers release during a native frame or figure operation and rejects its stale completion", async () => {
  const release = vi.fn(),
    step = pending();
  const lifetime = new ViewportLifetime(release);
  await lifetime.initialize(async () => {});
  const render = lifetime.during(async () => {
    await step.promise;
    return "old frame";
  });
  const rejected = expect(render).rejects.toMatchObject({ name: "AbortError" });
  lifetime.close();
  expect(release).not.toHaveBeenCalled();
  step.finish();
  await rejected;
  expect(release).toHaveBeenCalledTimes(1);
  await expect(lifetime.during(async () => "new work")).rejects.toMatchObject({
    name: "AbortError",
  });
});

it("native setup failures retain the original error and release their partial resources", async () => {
  const release = vi.fn(),
    lifetime = new ViewportLifetime(release);
  const failure = new Error("WebGL unavailable");
  await expect(
    lifetime.initialize(async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(release).toHaveBeenCalledTimes(1);
  lifetime.close();
  expect(release).toHaveBeenCalledTimes(1);
});

it("a closed or previously initialized native instance cannot be initialized again", async () => {
  const lifetime = new ViewportLifetime(vi.fn());
  await lifetime.initialize(async () => {});
  await expect(lifetime.initialize(async () => {})).rejects.toThrow(
    "already initialized",
  );
  lifetime.close();
  await expect(lifetime.initialize(async () => {})).rejects.toMatchObject({
    name: "AbortError",
  });
});
