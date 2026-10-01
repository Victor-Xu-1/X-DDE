import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { ReferenceImportForm } from "./ReferenceImportForm";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("requires an archive identifier and consent, preserves Back, and submits only reviewed material", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("archive unavailable"));
  const user = userEvent.setup();
  render(<ReferenceImportForm language="en" onCreated={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.type(
    screen.getByRole("textbox", { name: "PDB accession" }),
    "1CRN",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("textbox", { name: "PDB accession" })).toHaveValue(
    "1CRN",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Import research material" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Import research material" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "archive unavailable",
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "reference_import",
      identifier: "1CRN",
      format: "cif",
      evidence: null,
      scientific_inputs: [],
    }),
    expect.any(String),
  );
});
it("detaches selected activity provenance when changing the compound identity", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("review only"));
  const user = userEvent.setup();
  render(
    <ReferenceImportForm
      language="en"
      onCreated={vi.fn()}
      initial={{
        source: "chembl",
        identifier: "CHEMBL25",
        activity_id: 11,
        evidence: {
          asset_id: "asset",
          sha256: "a".repeat(64),
          record: 0,
          conformer: 0,
          version_id: "version",
        },
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  const input = screen.getByRole("textbox", {
    name: "ChEMBL molecule accession",
  });
  await user.clear(input);
  await user.type(input, "CHEMBL26");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Import research material" }),
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      identifier: "CHEMBL26",
      evidence: null,
      activity_id: null,
      scientific_inputs: [],
    }),
    expect.any(String),
  );
});
