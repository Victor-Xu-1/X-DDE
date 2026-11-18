import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { SceneInfo } from "../viewer/protocol";
import type { StructureViewerProps } from "../viewer/StructureViewport";
import type { NativeResult } from "./types";
import { InteractionResults } from "./InteractionResults";

const driver = vi.hoisted(() => ({
  current: null as StructureViewerProps | null,
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: StructureViewerProps) => {
    driver.current = props;
    return (
      <div
        data-testid="native-view"
        data-focus={JSON.stringify(props.focusResidue ?? null)}
      />
    );
  },
}));
afterEach(() => {
  cleanup();
  driver.current = null;
});

const observed = {
  chains: ["A"],
  ligands: [],
  atoms: 943,
  hasPolymer: true,
  residues: [
    { chain: "A", resn: "GLN", resi: 590, icode: "", key: "A:GLN:590:" },
  ],
} satisfies SceneInfo;
const result: NativeResult = {
  program: "plip",
  operation: "interaction_profile",
  version: "3.0.1",
  candidates: [],
  metrics: [],
  validation_points: [],
  structure_artifact: "complex.cif",
  artifact_sha256: { "complex.cif": "a".repeat(64) },
  interactions: [
    {
      chain: "A",
      residue: "GLN",
      number: 590,
      kind: "hydrogen_bond",
      distance: 2.42,
      protein_position: [0, 0, 0],
      ligand_position: [2.42, 0, 0],
    },
    {
      chain: "A",
      residue: "ARG",
      number: 562,
      kind: "hydrophobic",
      distance: 3.58,
      protein_position: [0, 0, 0],
      ligand_position: [3.58, 0, 0],
    },
  ],
};
const task = { id: "source-task" } as Job;
function loaded(scene: SceneInfo = observed) {
  act(() => {
    driver.current!.onSceneLoaded!(scene);
    driver.current!.onStructureVerification!(true);
  });
}
function focus() {
  return JSON.parse(
    screen.getByTestId("native-view").getAttribute("data-focus")!,
  );
}

it("locates mouse/keyboard selections repeatedly without changing source/contact values", async () => {
  const user = userEvent.setup();
  const snapshot = JSON.stringify(result);
  render(<InteractionResults job={task} result={result} language="en" />);
  const row = screen.getByRole("row", { name: /A:GLN590/ });
  await user.click(row);
  expect(focus()).toBeNull();
  expect(driver.current!.sourceSnapshot).toBe(true);
  expect(driver.current!.expectedStructureSha256).toBe("a".repeat(64));
  loaded();
  await user.click(row);
  expect(row).toHaveAttribute("aria-selected", "true");
  expect(focus()).toMatchObject({ residue: "A:GLN:590:", nonce: 1 });
  row.focus();
  await user.keyboard("{Enter}");
  expect(focus().nonce).toBe(2);
  await user.click(screen.getByRole("checkbox", { name: "Compare A:GLN590" }));
  expect(focus().nonce).toBe(2);
  expect(
    screen.getByRole("columnheader", { name: /Endpoint distance \(Å\)/ }),
  ).toBeInTheDocument();
  expect(screen.getByText("2.42")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Download interaction table" }),
  ).toHaveAttribute("download");
  expect(JSON.stringify(result)).toBe(snapshot);
});

it("rejects absent or ambiguous residues and clears focus when the scene fails verification", async () => {
  const user = userEvent.setup();
  render(<InteractionResults job={task} result={result} language="en" />);
  const row = screen.getByRole("row", { name: /A:GLN590/ });
  loaded({
    ...observed,
    residues: [
      ...observed.residues,
      {
        ...observed.residues[0],
        icode: "A",
        key: "A:GLN:590:A",
      },
    ],
  });
  await user.click(row);
  expect(focus()).toBeNull();
  await user.click(screen.getByRole("row", { name: /A:ARG562/ }));
  expect(focus()).toBeNull();
  loaded();
  await user.click(row);
  expect(focus()).not.toBeNull();
  act(() => driver.current!.onStructureVerification!(false));
  expect(focus()).toBeNull();
  await user.click(row);
  expect(focus()).toBeNull();
});

it("keeps native contact values and downloads available without a retained structure", () => {
  render(
    <InteractionResults
      job={task}
      result={{ ...result, structure_artifact: null }}
      language="en"
    />,
  );
  expect(screen.queryByTestId("native-view")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Review interactions" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "View tools for display and export" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("2.42")).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /A:GLN590/ })).not.toHaveAttribute(
    "tabindex",
  );
  expect(
    screen.getByRole("link", { name: "Download interaction table" }),
  ).toHaveAttribute("download");
});

it("jumps between the retained view and the filtered contacts without remounting", async () => {
  const user = userEvent.setup();
  render(<InteractionResults job={task} result={result} language="en" />);
  loaded();
  const view = screen.getByRole("region", {
    name: "Ligand and protein 3D view",
  });
  const contacts = screen.getByRole("region", { name: "Interaction review" });
  const native = screen.getByTestId("native-view");
  const showTools = screen.getByRole("button", {
    name: "View tools for display and export",
  });
  const showContacts = screen.getByRole("button", {
    name: "Review interactions",
  });
  expect(showTools).toHaveAttribute("aria-expanded", "false");
  expect(showContacts).toHaveAttribute("aria-controls", contacts.id);
  await user.click(showContacts);
  expect(contacts).toHaveFocus();
  await user.type(screen.getByRole("searchbox"), "GLN590");
  await user.click(screen.getByRole("row", { name: /A:GLN590/ }));
  await user.click(screen.getByRole("button", { name: "Back to 3D ↑" }));
  expect(view).toHaveFocus();
  await user.click(showTools);
  expect(showTools).toHaveAttribute("aria-expanded", "true");
  expect(view).toHaveAttribute("data-view-tools", "open");
  expect(screen.getByTestId("native-view")).toBe(native);
  expect(focus()).toMatchObject({ residue: "A:GLN:590:" });
  expect(screen.getByRole("searchbox")).toHaveValue("GLN590");
});

it("binds selection to the task, artifact and fingerprint while retaining language changes", async () => {
  const user = userEvent.setup();
  const view = render(
    <InteractionResults job={task} result={result} language="en" />,
  );
  loaded();
  await user.click(screen.getByRole("row", { name: /A:GLN590/ }));
  view.rerender(
    <InteractionResults job={task} result={result} language="zh" />,
  );
  expect(focus()).toMatchObject({ residue: "A:GLN:590:" });
  expect(screen.getByText("分析方法")).toBeInTheDocument();
  const previous = driver.current!;
  view.rerender(
    <InteractionResults
      job={{ id: "other-task" } as Job}
      result={result}
      language="en"
    />,
  );
  expect(focus()).toBeNull();
  act(() => previous.onSceneLoaded!(observed));
  await user.click(screen.getByRole("row", { name: /A:GLN590/ }));
  expect(focus()).toBeNull();
  loaded();
  await user.click(screen.getByRole("row", { name: /A:GLN590/ }));
  expect(focus()).not.toBeNull();
  view.rerender(
    <InteractionResults
      job={{ id: "other-task" } as Job}
      result={{
        ...result,
        artifact_sha256: { "complex.cif": "b".repeat(64) },
      }}
      language="en"
    />,
  );
  expect(focus()).toBeNull();
  loaded();
  await user.click(screen.getByRole("row", { name: /A:GLN590/ }));
  expect(focus()).not.toBeNull();
  view.rerender(
    <InteractionResults
      job={{ id: "other-task" } as Job}
      result={{
        ...result,
        structure_artifact: "other.cif",
        artifact_sha256: { "other.cif": "b".repeat(64) },
      }}
      language="en"
    />,
  );
  expect(focus()).toBeNull();
});
