import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReinventInputs } from "./ReinventInputs";
import { usesMolecularInput } from "./reinvent-modes";
import type { ScientificPayload } from "./types";
import type { MoleculeRef } from "../research/types";

const source = {
  asset_id: "explicit-source",
  sha256: "a".repeat(64),
  record: 2,
  conformer: 0,
};
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({
    value,
    label,
  }: {
    value: MoleculeRef | null;
    label: string;
  }) => (
    <span aria-label={label}>{value?.asset_id ?? "No material selected"}</span>
  ),
}));
afterEach(cleanup);

function Form({ initial }: { initial: MoleculeRef | null }) {
  const [payload, setPayload] = useState<ScientificPayload>({
    kind: "reinvent",
    mode: "analogues",
  });
  const [ligand, setLigand] = useState(initial);
  return (
    <>
      <ReinventInputs
        language="en"
        payload={payload}
        onChange={(patch) => setPayload((old) => ({ ...old, ...patch }))}
        ligand={ligand}
        onLigand={setLigand}
      />
      <output aria-label="Effective molecular input">
        {usesMolecularInput(payload) ? (ligand?.asset_id ?? "Missing") : "None"}
      </output>
    </>
  );
}

it("carries only an explicitly chosen molecule into source-checked R-group design", async () => {
  render(<Form initial={source} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByRole("combobox"), "r_groups");
  expect(
    screen.getByRole("checkbox", {
      name: "Verify the scaffold's source molecule",
    }),
  ).toBeChecked();
  expect(screen.getByLabelText("Scaffold source molecule")).toHaveTextContent(
    "explicit-source",
  );
  expect(screen.getByLabelText("Effective molecular input")).toHaveTextContent(
    "explicit-source",
  );
  await user.selectOptions(screen.getByRole("combobox"), "optimize");
  expect(screen.getByLabelText("Choose starting molecule")).toHaveTextContent(
    "explicit-source",
  );
  await user.selectOptions(screen.getByRole("combobox"), "r_groups");
  expect(screen.getByRole("checkbox")).toBeChecked();
  await user.click(screen.getByRole("checkbox"));
  expect(screen.getByLabelText("Effective molecular input")).toHaveTextContent(
    "None",
  );
  await user.selectOptions(screen.getByRole("combobox"), "de_novo");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole("combobox"), "r_groups");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});

it("keeps a fresh task empty and makes source selection explicit", async () => {
  render(<Form initial={null} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByRole("combobox"), "r_groups");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByLabelText("Effective molecular input")).toHaveTextContent(
    "None",
  );
  await user.click(screen.getByRole("checkbox"));
  expect(screen.getByLabelText("Effective molecular input")).toHaveTextContent(
    "Missing",
  );
  await user.selectOptions(screen.getByRole("combobox"), "linker");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Effective molecular input")).toHaveTextContent(
    "None",
  );
});
