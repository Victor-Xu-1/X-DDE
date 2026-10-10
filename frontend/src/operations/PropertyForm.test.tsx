import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PropertyForm } from "./PropertyForm";
import { api } from "../api";
import * as client from "../api";
import type { MoleculeRef } from "../research/types";
import type { Asset } from "./types";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("keeps the exact source version and sends no hidden SMILES after selecting file-only input", async () => {
  const asset: Asset = {
    id: "file",
    name: "STAT6-study-series.sdf",
    kind: "ligand",
    suffix: ".sdf",
    size: 1000,
    sha256: "a".repeat(64),
    created_at: "2026-10-10T00:00:00Z",
  };
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  vi.spyOn(api, "assets").mockResolvedValue([asset]);
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("verified request only"));
  const ref = {
    asset_id: "file",
    version_id: "version",
    record: 4,
    conformer: 0,
    sha256: "a".repeat(64),
  } as MoleculeRef;
  const user = userEvent.setup();
  render(
    <PropertyForm
      language="en"
      initialSmiles="CCO"
      initialFile="file"
      scientificInput={ref}
      onCreated={vi.fn()}
    />,
  );
  await user.click(
    screen.getByRole("radio", {
      name: "Upload a new molecular file (recommended)",
    }),
  );
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  expect(await screen.findByText(asset.name, { selector: "dd" })).toBeVisible();
  expect(screen.getByText("Record 5", { selector: "dd" })).toBeVisible();
  expect(screen.queryByText(/0 text structures/)).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Calculate properties" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "verified request only",
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "properties",
      smiles: [],
      ligand_files: ["file"],
      scientific_inputs: [ref],
    }),
    expect.any(String),
  );
});
it("limits text entries and preserves input across back navigation without launching a task", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  vi.spyOn(api, "assets").mockResolvedValue([]);
  const submit = vi.spyOn(api, "submit"),
    user = userEvent.setup();
  render(<PropertyForm language="en" onCreated={vi.fn()} />);
  await user.click(
    screen.getByRole("radio", {
      name: "Paste molecular structure text (SMILES)",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.type(screen.getByRole("textbox", { name: "SMILES" }), "CCO");
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("textbox", { name: "SMILES" })).toHaveValue("CCO");
  expect(submit).not.toHaveBeenCalled();
});
