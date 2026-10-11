import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PropertyForm } from "./PropertyForm";
import { api } from "../api";
import * as client from "../api";
import type { MoleculeRef } from "../research/types";
import type { Asset } from "./types";
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ source }: { source: unknown }) => (
    <div data-testid="review-structure">{JSON.stringify(source)}</div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each(["en", "zh"] as const)(
  "rechecks the environment while preserving the complete molecular draft in %s",
  async (language) => {
    const request = vi
      .spyOn(client, "request")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ availability: { configuration_present: true } });
    vi.spyOn(api, "assets").mockResolvedValue([]);
    const submit = vi.spyOn(api, "submit"),
      user = userEvent.setup(),
      zh = language === "zh";
    const smiles =
      "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3";
    render(
      <PropertyForm
        language={language}
        onCreated={vi.fn()}
        initialSmiles={smiles}
      />,
    );
    for (let step = 0; step < 3; step++)
      await user.click(
        screen.getByRole("button", {
          name: zh ? "下一步" : "Next",
        }),
      );
    const launch = screen.getByRole("button", {
      name: zh ? "计算性质" : "Calculate properties",
    });
    expect(launch).toBeDisabled();
    await user.click(
      screen.getByRole("button", {
        name: zh ? "重新检查计算环境" : "Check environment again",
      }),
    );
    await waitFor(() => expect(launch).toBeEnabled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("SMILES")).toHaveValue(smiles);
    expect(submit).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(2);
  },
);
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
      name: "Use the selected molecular file",
    }),
  );
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  expect(await screen.findByText(asset.name, { selector: "dd" })).toBeVisible();
  expect(screen.getByText("Record 5", { selector: "dd" })).toBeVisible();
  expect(screen.getByTestId("review-structure")).toHaveTextContent(
    JSON.stringify({ url: "/api/assets/file", record: 4 }),
  );
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
  expect(
    screen.getByRole("radio", {
      name: "Upload a new molecular file (recommended)",
    }),
  ).toBeChecked();
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
  for (let i = 0; i < 2; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByTestId("review-structure")).toHaveTextContent(
    JSON.stringify({ smiles: "CCO" }),
  );
  expect(submit).not.toHaveBeenCalled();
});
