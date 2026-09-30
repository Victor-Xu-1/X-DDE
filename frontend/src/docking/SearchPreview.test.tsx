import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SearchRegion } from "./SearchRegion";
vi.mock("../diffsbdd/ReferencePicker", () => ({ ReferencePicker: () => null }));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({
    onAtomSelected,
  }: {
    onAtomSelected(v: unknown): void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onAtomSelected({
          position: [1, 2, 3],
          chain: "A",
          residue: "ALA10",
          atom: "CA",
        })
      }
    >
      Pick actual source atom
    </button>
  ),
}));
afterEach(cleanup);
it("accepts an explicit preview center and clears stale picks when the receptor version changes", async () => {
  const user = userEvent.setup(),
    onCenter = vi.fn(),
    receptor = {
      asset_id: "r",
      sha256: "a".repeat(64),
      record: 0,
      conformer: 0,
    };
  const props = {
    language: "en" as const,
    receptor,
    kind: "box" as const,
    onKind: vi.fn(),
    reference: null,
    onReference: vi.fn(),
    center: ["", "", ""],
    onCenter,
    size: ["20", "20", "20"],
    onSize: vi.fn(),
  };
  const view = render(<SearchRegion {...props} />);
  await user.click(screen.getByText("Pick a search center in the 3D preview"));
  expect(
    screen.getByRole("button", { name: "Use selected atom as search center" }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Pick actual source atom" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Use selected atom as search center" }),
  );
  expect(onCenter).toHaveBeenCalledWith(["1", "2", "3"]);
  view.rerender(
    <SearchRegion
      {...props}
      receptor={{ ...receptor, sha256: "b".repeat(64) }}
    />,
  );
  await user.click(screen.getByText("Pick a search center in the 3D preview"));
  expect(
    screen.getByRole("button", { name: "Use selected atom as search center" }),
  ).toBeDisabled();
});
