import { createHash, webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConfidenceDownload } from "./ConfidenceDownload";
import type { Confidence } from "./confidence-data";

const saved = vi.hoisted(() => vi.fn());
vi.mock("../presentation/visual-export", () => ({ downloadBlob: saved }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const bytes = new TextEncoder().encode("retained native matrix bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
const data: Confidence = {
  metric: "pae",
  token_count: 1,
  indices: [0],
  stride: 1,
  matrix: [[0]],
  atom_plddt: [],
  atom_stride: 1,
  native_artifact: "native/pae_model_0.npz",
  native_sha256: digest,
};
function response(body = bytes) {
  let emitted = false;
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/octet-stream" }),
    body: {
      getReader: () => ({
        read: async () =>
          emitted
            ? { done: true }
            : ((emitted = true), { done: false, value: body }),
        cancel: vi.fn(),
      }),
    },
  };
}
it("downloads only the hash-verified snapshot and keeps the selected file name", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetcher = vi.fn().mockResolvedValue(response());
  vi.stubGlobal("fetch", fetcher);
  render(
    <ConfidenceDownload job="job" candidate="one" data={data} language="en" />,
  );
  fireEvent.click(screen.getByRole("link"));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(saved.mock.calls[0][1]).toBe("pae_model_0.npz");
  expect(saved.mock.calls[0][0].size).toBe(bytes.length);
  expect(fetcher.mock.calls[0][0]).toContain("source_sha256=" + digest);
});
it.each(["hash", "server"])(
  "shows a readable changed-file error and allows retry (%s)",
  async (mode) => {
    vi.stubGlobal("crypto", webcrypto);
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        mode === "hash"
          ? response(new Uint8Array([1]))
          : { ok: false, status: 409 },
      );
    vi.stubGlobal("fetch", fetcher);
    render(
      <ConfidenceDownload
        job="job"
        candidate="one"
        data={data}
        language="en"
      />,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reload its preview",
    );
    expect(saved).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(response());
    fireEvent.click(screen.getByRole("link"));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  },
);
it("aborts an old-source download and ignores a late response instead of saving another sample", async () => {
  vi.stubGlobal("crypto", {
    subtle: {
      digest: vi
        .fn()
        .mockResolvedValue(
          Uint8Array.from(digest.match(/../g)!, (value) =>
            Number.parseInt(value, 16),
          ).buffer,
        ),
    },
  });
  let resolve!: (value: unknown) => void;
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise((value) => {
        resolve = value;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const view = render(
    <ConfidenceDownload job="job" candidate="one" data={data} language="zh" />,
  );
  fireEvent.click(screen.getByRole("link"));
  fireEvent.click(screen.getByRole("link"));
  expect(fetcher).toHaveBeenCalledTimes(1);
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
  view.rerender(
    <ConfidenceDownload job="job" candidate="two" data={data} language="zh" />,
  );
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(response()));
  expect(saved).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("link")).not.toHaveAttribute("aria-busy");
});
it("rejects an excessive declared body before reading it", async () => {
  const read = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/octet-stream",
          "content-length": String(65 * 1024 ** 2),
        }),
        body: { getReader: read },
      }),
  );
  render(
    <ConfidenceDownload job="job" candidate="one" data={data} language="zh" />,
  );
  fireEvent.click(screen.getByRole("link"));
  expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法下载");
  expect(read).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
});
