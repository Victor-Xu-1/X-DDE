import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useViewerSnapshot, validSnapshot } from "./useViewerSnapshot";
afterEach(() => vi.unstubAllGlobals());
it("accepts bounded PNGs and refuses active documents or oversized payloads", () => {
  expect(
    validSnapshot({ id: "capture", png: "data:image/png;base64,iVBORw0KGgo=" }),
  ).toBe(true);
  expect(
    validSnapshot({
      id: "capture",
      png: "data:image/svg+xml,<svg onload='alert(1)'/>",
    }),
  ).toBe(false);
  expect(
    validSnapshot({
      id: "capture",
      png: "data:image/png;base64," + "A".repeat(64 * 1024 ** 2),
    }),
  ).toBe(false);
  expect(validSnapshot(null)).toBe(false);
});

it("downloads unchanged captured PNG bytes as a Blob and revokes the URL on source replacement", async () => {
  const create = vi.fn((_blob: Blob) => "blob:native-capture"),
    revoke = vi.fn();
  const OriginalUrl = URL;
  vi.stubGlobal(
    "URL",
    Object.assign(class extends OriginalUrl {}, {
      createObjectURL: create,
      revokeObjectURL: revoke,
    }),
  );
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const send = vi.fn();
  const { result, rerender } = renderHook(
    ({ source }) => useViewerSnapshot(source),
    { initialProps: { source: "first-pose" } },
  );
  act(() => result.current.begin(send));
  await act(async () =>
    result.current.receive({ id: send.mock.calls[0][1].id, png }),
  );
  await waitFor(() =>
    expect(result.current.downloadUrl).toBe("blob:native-capture"),
  );
  expect(result.current.image).toBe(png);
  const blob = create.mock.calls[0][0] as Blob;
  expect(blob.type).toBe("image/png");
  const data = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
  expect(data).toBe(png);
  rerender({ source: "another-pose" });
  await waitFor(() => expect(result.current.downloadUrl).toBe(""));
  expect(revoke).toHaveBeenCalledWith("blob:native-capture");
  expect(result.current.image).toBe("");
});
