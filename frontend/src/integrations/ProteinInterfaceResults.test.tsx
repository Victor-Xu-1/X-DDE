import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { SceneInfo } from "../viewer/protocol";
import type { StructureViewerProps } from "../viewer/StructureViewport";
import type { ProteinInterfaceResult } from "./types";
import { ProteinInterfaceResults } from "./ProteinInterfaceResults";

const driver = vi.hoisted(() => ({
  current: null as StructureViewerProps | null,
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: StructureViewerProps) => {
    driver.current = props;
    return (
      <div
        aria-label="Source molecular viewer"
        data-source={props.urls[0]}
        data-snapshot={String(props.sourceSnapshot)}
        data-focus={JSON.stringify(props.focusResidue ?? null)}
      />
    );
  },
}));
afterEach(() => {
  cleanup();
  driver.current = null;
});

const result = (name: string, file: string): ProteinInterfaceResult => ({
  name,
  source: {
    asset_id: file,
    sha256: (file === "one" ? "a" : "b").repeat(64),
    record: 0,
    conformer: 0,
  },
  structure_artifact: file + ".cif",
  table_artifact: file + ".csv",
  text_artifact: file + ".txt",
  xml_artifact: file + ".xml",
  polymer_residues: 883,
  interactions: [
    {
      kind: "water_bridge",
      chain: "A",
      residue: "PTR",
      number: 641,
      insertion_code: "",
      partner: { chain: "B", residue: "ARG", number: 604, insertion_code: "" },
      partner_role: "partner",
      protein_position: [0, 0, 0],
      ligand_position: [3, 0, 0],
      distance: 3.000001,
      bridge_position: [1, 1, 0],
    },
    {
      kind: "salt_bridge",
      chain: "A",
      residue: "GLN",
      number: 590,
      insertion_code: "A",
      partner: { chain: "B", residue: "LYS", number: 544, insertion_code: "" },
      partner_role: "partner",
      protein_position: [0, 0, 0],
      ligand_position: [4, 0, 0],
      distance: 4,
    },
  ],
});
const observed: SceneInfo = {
  chains: ["A", "B"],
  ligands: [],
  atoms: 6839,
  hasPolymer: true,
  residues: [
    { chain: "A", resn: "PTR", resi: 641, icode: "", key: "A:PTR:641:" },
    { chain: "B", resn: "ARG", resi: 604, icode: "", key: "B:ARG:604:" },
    { chain: "A", resn: "GLN", resi: 590, icode: "A", key: "A:GLN:590:A" },
    { chain: "B", resn: "LYS", resi: 544, icode: "", key: "B:LYS:544:" },
  ],
};
const props = {
  job: { id: "task-1" } as Job,
  interfaces: [result("Dimer one", "one"), result("Dimer two", "two")],
  language: "en" as const,
};
const focus = () =>
  JSON.parse(
    screen
      .getByLabelText("Source molecular viewer")
      .getAttribute("data-focus")!,
  );
const row = () => screen.getByRole("row", { name: /Compare A:PTR641/ });

it("focuses either exact endpoint, repeats selection and separates comparison from focus", async () => {
  const user = userEvent.setup();
  const original = JSON.stringify(props.interfaces);
  render(<ProteinInterfaceResults {...props} />);
  expect(driver.current?.expectedStructureSha256).toBe("a".repeat(64));
  expect(driver.current?.sourceSnapshot).toBe(true);
  expect(
    screen.getByRole("button", { name: "Focus target A:PTR641" }),
  ).toBeDisabled();
  act(() => driver.current?.onSceneLoaded?.(observed));
  const partner = screen.getByRole("button", {
    name: "Focus partner B:ARG604",
  });
  await user.click(partner);
  expect(focus()).toMatchObject({ id: "0", residue: "B:ARG:604:", nonce: 1 });
  expect(partner).toHaveAttribute("aria-pressed", "true");
  expect(row()).toHaveAttribute("aria-selected", "true");
  await user.click(partner);
  expect(focus().nonce).toBe(2);
  act(() => row().focus());
  await user.keyboard("{Enter}");
  expect(focus()).toMatchObject({ residue: "A:PTR:641:", nonce: 3 });
  await user.click(within(row()).getByRole("checkbox"));
  expect(focus().nonce).toBe(3);
  await user.click(
    screen.getByRole("button", { name: "Focus target A:GLN590A" }),
  );
  expect(focus().residue).toBe("A:GLN:590:A");
  expect(JSON.stringify(props.interfaces)).toBe(original);
  expect(screen.getByText("3.00")).toBeVisible();
});

it("clears verified focus on complex, source and job changes but preserves language changes", async () => {
  const user = userEvent.setup();
  const view = render(<ProteinInterfaceResults {...props} />);
  act(() => driver.current?.onSceneLoaded?.(observed));
  await user.click(
    screen.getByRole("button", { name: "Focus partner B:ARG604" }),
  );
  view.rerender(<ProteinInterfaceResults {...props} language="zh" />);
  expect(focus().residue).toBe("B:ARG:604:");
  await user.selectOptions(screen.getByLabelText("复合物"), "1");
  expect(focus()).toBeNull();
  expect(driver.current?.expectedStructureSha256).toBe("b".repeat(64));
  act(() => driver.current?.onSceneLoaded?.(observed));
  await user.click(screen.getByRole("button", { name: "定位伙伴 B:ARG604" }));
  const late = driver.current?.onSceneLoaded;
  const changed = props.interfaces.map((item) => ({
    ...item,
    source: { ...item.source, sha256: "c".repeat(64) },
  }));
  view.rerender(<ProteinInterfaceResults {...props} interfaces={changed} />);
  expect(focus()).toBeNull();
  expect(screen.getByLabelText("Complex")).toHaveValue("0");
  act(() => late?.(observed));
  expect(
    screen.getByRole("button", { name: "Focus target A:PTR641" }),
  ).toBeDisabled();
  act(() => driver.current?.onSceneLoaded?.(observed));
  await user.click(
    screen.getByRole("button", { name: "Focus target A:PTR641" }),
  );
  view.rerender(
    <ProteinInterfaceResults
      {...props}
      interfaces={changed}
      job={{ id: "other" } as Job}
    />,
  );
  expect(focus()).toBeNull();
  expect(
    screen
      .getByLabelText("Source molecular viewer")
      .getAttribute("data-source"),
  ).toContain("/other/");
});

it("disables unknown or ambiguous endpoint focus and recovers after source verification fails", async () => {
  const user = userEvent.setup();
  render(<ProteinInterfaceResults {...props} />);
  act(() =>
    driver.current?.onSceneLoaded?.({
      ...observed,
      residues: [observed.residues[1]],
    }),
  );
  expect(row()).not.toHaveAttribute("tabindex");
  expect(
    screen.getByRole("button", { name: "Focus target A:PTR641" }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Focus partner B:ARG604" }),
  );
  expect(focus().residue).toBe("B:ARG:604:");
  act(() => driver.current?.onStructureVerification?.(false));
  expect(focus()).toBeNull();
  expect(
    screen.getByRole("button", { name: "Focus partner B:ARG604" }),
  ).toBeDisabled();
  act(() =>
    driver.current?.onSceneLoaded?.({
      ...observed,
      residues: [...observed.residues, observed.residues[0]],
    }),
  );
  expect(
    screen.getByRole("button", { name: "Focus target A:PTR641" }),
  ).toBeDisabled();
  act(() => driver.current?.onSceneLoaded?.(observed));
  expect(
    screen.getByRole("button", { name: "Focus target A:PTR641" }),
  ).toBeEnabled();
});

it("keeps original report links attached to the chosen complex without changing native values", async () => {
  const user = userEvent.setup();
  render(<ProteinInterfaceResults {...props} />);
  await user.selectOptions(screen.getByLabelText("Complex"), "1");
  expect(screen.getByRole("heading", { name: "Dimer two" })).toBeVisible();
  for (const [label, extension] of [
    ["Contacts CSV", "csv"],
    ["Native report TXT", "txt"],
    ["Native report XML", "xml"],
    ["Source structure", "cif"],
  ]) {
    const link = screen.getByRole("link", { name: label });
    expect(link.getAttribute("href")).toContain("two." + extension);
    expect(link).toHaveAttribute("download");
  }
  expect(
    screen
      .getByLabelText("Source molecular viewer")
      .getAttribute("data-source"),
  ).toContain("two.cif");
  await user.click(
    screen.getByRole("button", { name: "Interpreting contacts and distances" }),
  );
  expect(screen.getByText(/not binding energy or affinity/)).toBeVisible();
});
