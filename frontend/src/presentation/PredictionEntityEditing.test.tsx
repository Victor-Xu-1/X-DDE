import { useState } from "react";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { MolecularInputs } from "../guided/MolecularInputs";
import type { Component } from "../types";
import { predictionEntitySummary } from "./PredictionEntitySummary";
import { FeatureForm } from "../operations/FeatureForm";
import { useMol1Composition } from "../integrations/Mol1Composition";
import { mol1Defaults } from "../integrations/mol1-settings";

vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: false, error: "", recheck: vi.fn() }),
}));

afterEach(() => vi.restoreAllMocks());

function Editor() {
  const [items, onChange] = useState<Component[]>([
    { kind: "protein", value: "PREACHINGS", count: 1 },
    { kind: "ligand", value: "CCD_ATP", count: 1 },
    { kind: "ligand", value: "CCD_NAD", count: 1 },
  ]);
  return (
    <>
      <MolecularInputs
        items={items}
        onChange={onChange}
        language="en"
        expert
        workflow="complex"
      />
      <output aria-label="Current entity inputs">
        {JSON.stringify(items)}
      </output>
    </>
  );
}

it.each(["uploading", "earlier"] as const)(
  "keeps a delayed molecular upload on its actual owner when the %s entity is removed",
  async (removed) => {
    const asset = {
      id: "11111111-1111-4111-8111-111111111111",
      kind: "ligand" as const,
      name: "controlled-upload.sdf",
      sha256: "a".repeat(64),
      suffix: ".sdf",
      size: 25,
      created_at: "",
    };
    let finish!: (value: typeof asset) => void;
    vi.spyOn(api, "upload").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("/assets/" + asset.id + "/metadata")
        ? Response.json(asset)
        : new Response(null, { status: 404 }),
    );
    const user = userEvent.setup();
    render(<Editor />);
    await user.click(
      screen.getAllByText("Use an existing 3D molecule file")[0],
    );
    await user.upload(
      screen.getAllByLabelText("Upload Ligand file")[0],
      new File(
        ["controlled transport bytes; no chemistry or inference"],
        asset.name,
      ),
    );
    expect(finish).toBeTypeOf("function");
    await user.click(
      screen.getByRole("button", {
        name: removed === "uploading" ? "Remove 2" : "Remove 1",
      }),
    );
    await act(async () => finish(asset));
    const items = JSON.parse(
      screen.getByLabelText("Current entity inputs").textContent!,
    ) as Component[];
    expect(items).toHaveLength(2);
    if (removed === "uploading") {
      expect(items.map((item) => item.value)).toEqual([
        "PREACHINGS",
        "CCD_NAD",
      ]);
      expect(items.every((item) => !item.ligand_file)).toBe(true);
    } else {
      expect(items[0].ligand_file).toBe(asset.id);
      expect(items[1]).toEqual({ kind: "ligand", value: "CCD_NAD", count: 1 });
    }
  },
);

it("retains input DOM, edits, copies and collapse state on the same surviving entity", async () => {
  const user = userEvent.setup();
  render(<Editor />);
  const protein = screen.getByRole("textbox", {
    name: "One-letter amino-acid sequence",
  });
  await user.type(protein, "G");
  expect(protein).toHaveFocus();
  expect(protein).toHaveValue("PREACHINGSG");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Copies 1" }),
    "2",
  );
  expect(
    screen.getByRole("textbox", { name: "One-letter amino-acid sequence" }),
  ).toBe(protein);
  await user.click(
    screen.getByRole("button", { name: "Collapse Small molecule / ligand 3" }),
  );
  await user.click(screen.getByRole("button", { name: "Remove 1" }));
  const collapsed = screen.getByRole("button", {
    name: "Expand Small molecule / ligand 2",
  });
  expect(collapsed).toHaveAttribute("aria-expanded", "false");
  const entity = screen.getByRole("article", {
    name: "Small molecule / ligand 2",
  });
  expect(
    within(entity).getByLabelText("SMILES or CCD_ identifier"),
  ).toHaveValue("CCD_NAD");
  await user.click(collapsed);
  expect(
    within(entity).getByRole("textbox", { name: "SMILES or CCD_ identifier" }),
  ).toHaveValue("CCD_NAD");
});

it("keeps expert fields focused and expanded throughout chain and modification edits", async () => {
  const user = userEvent.setup();
  render(<Editor />);
  const protein = screen.getByRole("article", {
    name: /^Protein 1$/,
  });
  await user.click(
    within(protein).getByText("Chains, modifications and precomputed features"),
  );
  const chain = within(protein).getByRole("textbox", {
    name: "Chain IDs (one per copy)",
  });
  await user.type(chain, "STAT6");
  expect(chain).toHaveValue("STAT6");
  expect(chain).toHaveFocus();
  expect(within(protein).getByLabelText("Chain IDs (one per copy)")).toBe(
    chain,
  );
  expect(chain.closest("details")).toHaveAttribute("open");
  await user.click(
    within(protein).getByRole("button", { name: "Add modification" }),
  );
  const modification = within(protein).getByRole("textbox", {
    name: /^CCD$/,
  });
  await user.clear(modification);
  await user.type(modification, "CCD_MSE");
  expect(modification).toHaveValue("CCD_MSE");
  expect(modification).toHaveFocus();
  expect(within(protein).getByLabelText("CCD", { exact: true })).toBe(
    modification,
  );
  expect(modification.closest("details")).toHaveAttribute("open");
  const current = JSON.parse(
    screen.getByLabelText("Current entity inputs").textContent!,
  );
  expect(current[0].chain_ids).toEqual(["STAT6"]);
  expect(current[0].modifications).toEqual([{ position: 1, ccd: "CCD_MSE" }]);
});

it("ignores an MSA reply for a chain identity edited while the upload was pending", async () => {
  const asset = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "msa" as const,
    name: "controlled.a3m",
    sha256: "a".repeat(64),
    suffix: ".a3m",
    size: 25,
    created_at: "",
  };
  let finish!: (value: typeof asset) => void;
  vi.spyOn(api, "upload").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<Editor />);
  const protein = screen.getByRole("article", { name: /^Protein 1$/ });
  await user.click(
    within(protein).getByText("Chains, modifications and precomputed features"),
  );
  await user.upload(
    within(protein).getByLabelText("Upload Unpaired MSA"),
    new File(["controlled transport, not scientific alignment"], asset.name),
  );
  expect(finish).toBeTypeOf("function");
  const chain = within(protein).getByRole("textbox", {
    name: "Chain IDs (one per copy)",
  });
  await user.type(chain, "STAT6");
  await act(async () => finish(asset));
  const current = JSON.parse(
    screen.getByLabelText("Current entity inputs").textContent!,
  );
  expect(current[0].chain_ids).toEqual(["STAT6"]);
  expect(current[0].unpaired_msa).toBeFalsy();
  expect(chain).toHaveFocus();
});

it("keeps a newer molecular entry when an older upload finishes", async () => {
  const asset = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "ligand" as const,
    name: "controlled.sdf",
    sha256: "a".repeat(64),
    suffix: ".sdf",
    size: 25,
    created_at: "",
  };
  let finish!: (value: typeof asset) => void;
  vi.spyOn(api, "upload").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<Editor />);
  await user.click(screen.getAllByText("Use an existing 3D molecule file")[0]);
  await user.upload(
    screen.getAllByLabelText("Upload Ligand file")[0],
    new File(["controlled transport"], asset.name),
  );
  const field = screen.getAllByRole("textbox", {
    name: "SMILES or CCD_ identifier",
  })[0];
  await user.clear(field);
  await user.type(field, "CCD_HEM");
  await act(async () => finish(asset));
  const items = JSON.parse(
    screen.getByLabelText("Current entity inputs").textContent!,
  ) as Component[];
  expect(items[1].value).toBe("CCD_HEM");
  expect(items[1].ligand_file).toBeFalsy();
  expect(items[2]).toEqual({ kind: "ligand", value: "CCD_NAD", count: 1 });
});

it("reveals an invalid collapsed input when native form constraints are checked", async () => {
  const user = userEvent.setup();
  render(<Editor />);
  const field = screen.getByRole("textbox", {
    name: "One-letter amino-acid sequence",
  });
  await user.clear(field);
  await user.click(screen.getByRole("button", { name: "Collapse Protein 1" }));
  expect(field).not.toBeVisible();
  act(() => {
    expect((field as HTMLTextAreaElement).checkValidity()).toBe(false);
  });
  await waitFor(() => expect(field).toBeVisible());
  expect(field).toHaveFocus();
});

it("combines concurrent upload replies through the parent input authority", async () => {
  const asset = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "ligand" as const,
    name: "controlled.sdf",
    sha256: "a".repeat(64),
    suffix: ".sdf",
    size: 25,
    created_at: "",
  };
  const replies: Array<(value: typeof asset) => void> = [];
  vi.spyOn(api, "upload").mockImplementation(
    () => new Promise((resolve) => replies.push(resolve)),
  );
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(null, { status: 404 }),
  );
  const user = userEvent.setup();
  render(<Editor />);
  for (const summary of screen.getAllByText("Use an existing 3D molecule file"))
    await user.click(summary);
  const uploads = screen.getAllByLabelText("Upload Ligand file");
  await user.upload(uploads[0], new File(["controlled transport"], asset.name));
  await user.upload(uploads[1], new File(["controlled transport"], asset.name));
  expect(replies).toHaveLength(2);
  const second = { ...asset, id: "22222222-2222-4222-8222-222222222222" };
  await act(async () => {
    replies[0](asset);
    replies[1](second);
  });
  const items = JSON.parse(
    screen.getByLabelText("Current entity inputs").textContent!,
  ) as Component[];
  expect(items.slice(1).map((item) => item.ligand_file)).toEqual([
    asset.id,
    second.id,
  ]);
});

it("uses the same entity card in supporting-feature inputs without creating a task", async () => {
  const submit = vi.spyOn(api, "submit");
  const user = userEvent.setup();
  render(<FeatureForm language="en" onCreated={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  const field = screen.getByRole("textbox", {
    name: "One-letter amino-acid sequence",
  });
  await user.type(field, "PREACHINGS");
  await user.click(screen.getByRole("button", { name: "Collapse Protein 1" }));
  expect(field).not.toBeVisible();
  await user.click(screen.getByRole("button", { name: "Expand Protein 1" }));
  expect(field).toHaveValue("PREACHINGS");
  expect(submit).not.toHaveBeenCalled();
});

it("summarizes entered sequences and files without claiming calculated geometry", () => {
  expect(
    predictionEntitySummary(
      { kind: "protein", value: ">STAT6 input\nPREA CHINGS" },
      "en",
    ),
  ).toBe("10 residues");
  expect(predictionEntitySummary({ kind: "dna", value: "ATGCNX" }, "zh")).toBe(
    "6 个碱基",
  );
  expect(
    predictionEntitySummary({ kind: "protein", value: "BAD*" }, "en"),
  ).toBe("Check sequence");
  expect(
    predictionEntitySummary(
      { kind: "ligand", value: "", ligand_file: "native-id" },
      "en",
    ),
  ).toBe("Structure file");
  expect(
    predictionEntitySummary({ kind: "ligand", value: "CCD_ATP" }, "en"),
  ).toBe("CCD · ATP");
});

it("updates Mol-1 dependent setup atomically and preserves ignored late intents", () => {
  const { result } = renderHook(() =>
    useMol1Composition(() => ({
      components: [
        { kind: "protein", value: "PREACHINGS", count: 1 },
        { kind: "rna", value: "AUGC", count: 1 },
      ],
      settings: { ...mol1Defaults(), use_template: true, use_rna_msa: true },
      bonds: [],
    })),
  );
  act(() => {
    result.current.setSettings((previous) => ({ ...previous, samples: 3 }));
    result.current.editComponents((previous) =>
      previous.filter((item) => item.kind !== "protein"),
    );
  });
  expect(result.current.settings.samples).toBe(3);
  expect(result.current.settings.use_template).toBe(false);
  expect(result.current.settings.use_rna_msa).toBe(true);
  const before = result.current.components;
  act(() => result.current.editComponents((previous) => previous));
  expect(result.current.components).toBe(before);
  expect(result.current.settings.samples).toBe(3);
});
