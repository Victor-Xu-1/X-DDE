import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { OperationResult } from "../operations/types";
import type { IdentityResult } from "../diffsbdd/types";
import { api, request } from "../api";
import { useNativeIdentity } from "./useNativeIdentity";

vi.mock("../api", () => ({
  api: { result: vi.fn() },
  request: vi.fn(),
}));

it("keeps a verified atom map paired with only its own job artifact", async () => {
  const subject = {
    asset_id: "sdf",
    sha256: "a".repeat(64),
    record: 1,
    conformer: 0,
  };
  const map: IdentityResult = {
    mode: "identity",
    complete: true,
    reference: subject,
    molecule_artifact: "first.sdf",
    identity_basis: "rdkit_removeHs_record_order",
    atoms: [{ index: 0, element: "C", selectable: true }],
  };
  let finish!: (result: OperationResult) => void;
  vi.mocked(request).mockImplementation(
    async (path) =>
      ({
        id: path.split("/").at(-1),
        status: "succeeded",
      }) as never,
  );
  vi.mocked(api.result).mockImplementation(async (id) => {
    if (id === "first") return map as unknown as OperationResult;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const { result, rerender } = renderHook(
    ({ id }) => useNativeIdentity(subject, "en", id),
    { initialProps: { id: "first" } },
  );
  await waitFor(() =>
    expect(result.current.result?.molecule_artifact).toBe("first.sdf"),
  );
  rerender({ id: "second" });
  await waitFor(() => expect(result.current.job?.id).toBe("second"));
  expect(result.current.result).toBeNull();
  await act(async () => {
    finish({
      ...map,
      reference: { ...subject, record: 2 },
    } as unknown as OperationResult);
  });
  expect(result.current.error).toContain("Atom identity does not match");
  expect(result.current.result).toBeNull();
});
