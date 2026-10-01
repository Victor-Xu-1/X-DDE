import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ToolCenter } from "./ToolCenter";
import { parsePositions } from "./ScientificInputs";
import { campaignConfig } from "./campaign-model";
import { PropertyForm } from "./PropertyForm";
import { ExpertParameters } from "./ExpertParameters";
import { HarnessField } from "./HarnessField";
import { api } from "../api";
import * as client from "../api";
import { defaults, prediction, validate } from "../form-model";

it("finds real capabilities by research goal without exposing the upstream stub", () => {
  render(
    <ToolCenter
      language="zh"
      health={null}
      jobs={[]}
      onCreated={vi.fn()}
      onDraft={vi.fn()}
      onPredict={vi.fn()}
    />,
  );
  expect(screen.getByRole("heading", { name: "计算小分子性质" })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "抗体设计与 CDR 优化" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /客观可开发性/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "蛋白" }));
  expect(
    screen.getByRole("heading", { name: "结构引导序列设计" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "计算小分子性质" }),
  ).not.toBeInTheDocument();
});

it("converts user-facing one-based residue ranges exactly once", () => {
  expect(parsePositions("1, 3-5, 4", 6)).toEqual([0, 2, 3, 4]);
  expect(() => parsePositions("0", 6)).toThrow();
  expect(() => parsePositions("3-8", 6)).toThrow();
  const config = campaignConfig({
    targetName: "input contract",
    targets: { A: "ACDE" },
    format: "VHVL",
    binders: { B: "ACDE", C: "ACDE" },
    cdr: { B: parsePositions("2-3"), C: parsePositions("1") },
    fixed: { B: parsePositions("3") },
    budget: "standard",
  });
  expect(config.initial_binders).toEqual([
    {
      name: "initial-1",
      chains: {
        B: {
          sequence: "ACDE",
          chain_type: "VH",
          cdr_regions: [1, 2],
          fixed_residues: [2],
        },
        C: {
          sequence: "ACDE",
          chain_type: "VL",
          cdr_regions: [0],
          fixed_residues: [],
        },
      },
    },
  ]);
});

it("accepts uploaded ligand input and preserves extended controls when compiling a prediction", () => {
  const component = {
    kind: "ligand" as const,
    value: "",
    count: 1,
    ligand_file: "8db35420-9896-4b82-b964-a96730e5fef4",
  };
  expect(validate("file ligand", [component])).toBeNull();
  const value = prediction("file ligand", [component], {
    ...defaults,
    additional_seeds: [102],
    atom_confidence: false,
  });
  expect(value.components[0].ligand_file).toBe(component.ligand_file);
  expect(value.parameters.additional_seeds).toEqual([102]);
  expect(value.parameters.atom_confidence).toBe(false);
});

it("submits standalone properties without scheduling structure prediction", async () => {
  const readiness = vi
    .spyOn(client, "request")
    .mockResolvedValue({ availability: { configuration_present: true } });
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("server unavailable"));
  render(<PropertyForm language="en" onCreated={vi.fn()} />);
  fireEvent.change(
    screen.getByRole("combobox", { name: "How will you provide molecules?" }),
    { target: { value: "smiles" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByRole("textbox", { name: "SMILES" }), {
    target: { value: "CCO\nCC(=O)O" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Calculate properties" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "server unavailable",
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "properties",
      smiles: ["CCO", "CC(=O)O"],
      ligand_files: [],
    }),
    expect.any(String),
  );
  submit.mockRestore();
  readiness.mockRestore();
});

it("keeps form labels attached to scientific inputs when help buttons are present", () => {
  const update = vi.fn();
  render(
    <>
      <ExpertParameters
        value={defaults}
        onChange={update}
        language="en"
        expert={false}
      />
      <HarnessField
        field={{
          key: "sequence",
          kind: "sequence",
          label: ["序列", "Sequence"],
          help: ["输入序列", "Enter a sequence"],
        }}
        payload={{ sequence: "" }}
        onChange={update}
        language="en"
        tool="esm"
      />
    </>,
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Include evolutionary information?" }),
    { target: { value: "uploaded" } },
  );
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ feature_mode: "uploaded" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Sequence" }), {
    target: { value: "ac de" },
  });
  expect(update).toHaveBeenCalledWith("ACDE");
  update.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Sequence help" }));
  expect(update).not.toHaveBeenCalled();
});
