import { render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { LibraryInput } from "./LibraryInput";
import * as client from "../api";
import type { MoleculeRef } from "../research/types";
import { referenceKey } from "../research/input-catalog";
const a = { asset_id: "A", sha256: "a".repeat(64), record: 0, conformer: 0 };
const b = { ...a, asset_id: "B", sha256: "b".repeat(64) };
const metadata = (ref: MoleculeRef) => ({
  id: ref.asset_id,
  name: ref.asset_id + ".sdf",
  sha256: ref.sha256,
  kind: "ligand",
  suffix: ".sdf",
  size: 100,
});
afterEach(() => vi.restoreAllMocks());
beforeEach(() => vi.spyOn(client.api, "assets").mockResolvedValue([]));
it("replaces the old filename and eligibility when the externally controlled reference changes", async () => {
  const replies: ((value: unknown) => void)[] = [];
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.includes("/A/")
      ? metadata(a)
      : new Promise((resolve) => replies.push(resolve)),
  );
  function Harness({ value }: { value: MoleculeRef | null }) {
    const [verified, setVerified] = useState<MoleculeRef | null>(null);
    return (
      <>
        <LibraryInput
          value={value}
          onChange={vi.fn()}
          onVerified={setVerified}
          language="en"
        />
        <button
          disabled={!value || referenceKey(value) !== referenceKey(verified)}
        >
          Next with library
        </button>
      </>
    );
  }
  const view = render(<Harness value={a} />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Next with library" }),
    ).toBeEnabled(),
  );
  view.rerender(<Harness value={b} />);
  expect(
    screen.getByRole("button", { name: "Next with library" }),
  ).toBeDisabled();
  expect(screen.queryByText(/A.sdf ·/)).toBeNull();
  await act(async () => replies.forEach((reply) => reply(metadata(b))));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Next with library" }),
    ).toBeEnabled(),
  );
  expect(screen.getByText(/B.sdf ·/)).toBeVisible();
  view.rerender(<Harness value={null} />);
  expect(
    screen.getByRole("button", { name: "Next with library" }),
  ).toBeDisabled();
  expect(screen.queryByText(/B.sdf ·/)).toBeNull();
});
it("rejects changed file identity and individual-record substitution without exposing a private error", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    ...metadata(a),
    sha256: b.sha256,
  });
  const verified = vi.fn();
  render(
    <LibraryInput
      value={a}
      onChange={vi.fn()}
      onVerified={verified}
      language="en"
    />,
  );
  await screen.findByRole("alert");
  expect(verified).not.toHaveBeenCalledWith(a);
  expect(screen.queryByText(/A.sdf ·/)).toBeNull();
});
