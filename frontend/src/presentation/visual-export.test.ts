import { afterEach, expect, it, vi } from "vitest";
import { downloadBlob } from "./visual-export";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("keeps scientific download bytes alive during a deferred embedded-browser handoff and later releases them", () => {
  vi.useFakeTimers();
  const create = vi.fn(() => "blob:scientific-figure"),
    revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const content = new Blob(
    [
      "<svg xmlns='http://www.w3.org/2000/svg'><text>native result</text></svg>",
    ],
    { type: "image/svg+xml" },
  );
  downloadBlob(content, "native:figure.svg");
  expect(create).toHaveBeenCalledWith(content);
  expect(click).toHaveBeenCalledOnce();
  expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe(
    "native-figure.svg",
  );
  vi.advanceTimersByTime(2000);
  expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(58000);
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:scientific-figure");
});
