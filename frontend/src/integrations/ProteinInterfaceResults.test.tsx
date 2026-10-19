import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { ProteinInterfaceResult } from "./types";
import { ProteinInterfaceResults } from "./ProteinInterfaceResults";

vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls, nativeInteractions, sourceSnapshot }: any) => (
    <div
      aria-label="Source molecular viewer"
      data-source={urls[0]}
      data-count={nativeInteractions.length}
      data-snapshot={String(sourceSnapshot)}
    />
  ),
}));

const result = (name: string, file: string): ProteinInterfaceResult => ({
  name,
  source: {} as any,
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
      distance: 3,
      bridge_position: [1, 1, 0],
    },
  ],
});

it("keeps complete contacts and source/report downloads attached to the selected complex", async () => {
  const user = userEvent.setup();
  render(
    <ProteinInterfaceResults
      job={{ id: "task-1" } as Job}
      interfaces={[result("Dimer one", "one"), result("Dimer two", "two")]}
      language="en"
    />,
  );
  expect(screen.getByText("A:PTR641")).toBeInTheDocument();
  expect(screen.getByText("B:ARG604")).toBeInTheDocument();
  expect(screen.getByText("Water bridge")).toBeInTheDocument();
  expect(screen.getByLabelText("Source molecular viewer")).toHaveAttribute(
    "data-snapshot",
    "true",
  );
  await user.selectOptions(screen.getByLabelText("Complex"), "1");
  expect(
    screen.getByRole("heading", { name: "Dimer two" }),
  ).toBeInTheDocument();
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
});
