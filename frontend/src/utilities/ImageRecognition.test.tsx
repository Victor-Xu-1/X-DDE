import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ImageRecognition } from "./ImageRecognition";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("connects to the existing local editor without starting recognition", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(<ImageRecognition language="en" />);
  const frame = await screen.findByTitle(
    "Image recognition and molecular editor",
  );
  expect(frame).toHaveAttribute(
    "src",
    expect.stringMatching(/^http:\/\/(localhost|127\.0\.0\.1):8940\/$/),
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/api/utilities/recognition");
  expect(fetcher.mock.calls[0][1].method).toBeUndefined();
});
it("offers retry on failure and replaces the offline state after recovery", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(<ImageRecognition language="zh" />);
  expect(await screen.findByText("图片识别工作台尚未打开")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "重新连接" }));
  await waitFor(() =>
    expect(screen.getByTitle("图片识别与分子编辑")).toBeVisible(),
  );
});
