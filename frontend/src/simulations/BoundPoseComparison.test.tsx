import { useEffect } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { BoundPoseComparison } from "./BoundPoseComparison";
import type { StructureSource } from "./molstar-controller";
import type {
  MolecularViewHandle,
  SavedMolecularView,
} from "./molecular-view-state";
const values = vi.hoisted(() => ({ restore: vi.fn(), seen: [] as string[] }));
vi.mock("./MolecularViewport", () => ({
  MolecularViewport: ({
    fixedLigand,
    sources,
    savedView,
    onViewHandle,
    onRememberView,
  }: {
    fixedLigand?: string;
    sources: unknown[];
    savedView?: SavedMolecularView;
    onViewHandle?(handle: MolecularViewHandle | null): void;
    onRememberView?(state: SavedMolecularView): void;
  }) => {
    useEffect(() => {
      const state = {
        view: {
          protein: true,
          surface: false,
          contacts: true,
          ligand: fixedLigand ?? "all",
        },
        camera: { target: [1, 2, 3] },
      } as unknown as SavedMolecularView;
      onViewHandle?.({
        snapshot: () => state,
        restoreCamera: values.restore,
        capture: vi.fn(),
      } as MolecularViewHandle);
      return () => {
        onRememberView?.(state);
        onViewHandle?.(null);
      };
    }, [onViewHandle]);
    return (
      <div
        data-testid="native-pose"
        data-pose={fixedLigand ?? "overlay"}
        data-saved={!!savedView}
      >
        {JSON.stringify(sources)}
      </div>
    );
  },
}));
afterEach(() => {
  cleanup();
  values.restore.mockClear();
});
const sources: StructureSource[] = [
  { url: "/protein.pdb", format: "pdb", role: "protein" },
  { url: "/A.sdf", format: "sdf", role: "ligand" },
  { url: "/B.sdf", format: "sdf", role: "ligand" },
];
it("shows the exact A/B sources separately, matches cameras and preserves views across overlay switching", async () => {
  const user = userEvent.setup();
  render(
    <BoundPoseComparison
      sources={sources}
      labels={["STAT6-A", "STAT6-B"]}
      language="en"
    />,
  );
  expect(
    within(screen.getByRole("region", { name: "A · STAT6-A" })).getByTestId(
      "native-pose",
    ),
  ).toHaveAttribute("data-pose", "a");
  expect(
    within(screen.getByRole("region", { name: "B · STAT6-B" })).getByTestId(
      "native-pose",
    ),
  ).toHaveAttribute("data-pose", "b");
  await user.click(screen.getByRole("button", { name: "Match views" }));
  expect(values.restore).toHaveBeenCalledWith({ target: [1, 2, 3] });
  await user.click(screen.getByRole("button", { name: /^Overlay$/ }));
  expect(screen.getAllByTestId("native-pose")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "A / B side by side" }));
  expect(screen.getAllByTestId("native-pose")).toHaveLength(2);
  for (const view of screen.getAllByTestId("native-pose"))
    expect(view).toHaveAttribute("data-saved", "true");
  expect(sources[1].url).toBe("/A.sdf");
  expect(sources[2].url).toBe("/B.sdf");
});
