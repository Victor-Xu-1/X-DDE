import { useRef } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { MolecularInputs } from "../guided/MolecularInputs";
import type { Component } from "../types";
import { Mol1FeatureInputs } from "./Mol1FeatureInputs";
import { useMol1Composition } from "./Mol1Composition";
import { mol1Defaults } from "./mol1-settings";

afterEach(() => vi.restoreAllMocks());
function SupportingFiles({ studyInputs = false }: { studyInputs?: boolean }) {
  const entityKeys = useRef(new WeakMap<Component, string>()).current;
  const {
    components,
    setComponents,
    editComponents,
    settings,
    setSettings,
    bonds,
    setBonds,
  } = useMol1Composition(() => ({
    components: [
      { kind: "protein", value: "PREACHINGS", count: 1, chain_ids: ["A"] },
      { kind: "protein", value: "MREACHINGS", count: 1, chain_ids: ["B"] },
    ],
    settings: { ...mol1Defaults(), feature_mode: "uploaded" },
    bonds: [],
  }));
  return (
    <>
      {studyInputs && (
        <MolecularInputs
          items={components}
          onChange={editComponents}
          entityKeys={entityKeys}
          supportingFiles={false}
          features={settings.feature_mode === "uploaded"}
          language="en"
          expert
          workflow="protein-complex"
        />
      )}
      <button onClick={() => setComponents((current) => current.slice(1))}>
        Remove first study entity
      </button>
      <Mol1FeatureInputs
        entityKeys={entityKeys}
        value={settings}
        onChange={setSettings}
        components={components}
        onComponents={setComponents}
        language="en"
      />
      <output aria-label="Current supporting inputs">
        {JSON.stringify(components)}
      </output>
      <button
        onClick={() => {
          setSettings((current) => ({ ...current, cycles: 7 }));
          setBonds([
            {
              left: { entity: 1, copy_index: null, position: 1, atom: "N" },
              right: { entity: 2, copy_index: null, position: 1, atom: "N" },
            },
          ]);
        }}
      >
        Update later setup
      </button>
      <output aria-label="Supporting dependent inputs">
        {JSON.stringify({ bonds, cycles: settings.cycles })}
      </output>
    </>
  );
}

it.each(["uploading", "earlier"] as const)(
  "keeps a supporting MSA on its owner when the %s study entity is removed",
  async (removed) => {
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
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(null, { status: 404 }),
    );
    const user = userEvent.setup();
    render(<SupportingFiles />);
    await user.upload(
      screen.getAllByLabelText("Upload Unpaired A3M")[
        removed === "uploading" ? 0 : 1
      ],
      new File(["controlled transport, not scientific alignment"], asset.name),
    );
    expect(finish).toBeTypeOf("function");
    await user.click(
      screen.getByRole("button", { name: "Remove first study entity" }),
    );
    await act(async () => finish(asset));
    const current = JSON.parse(
      screen.getByLabelText("Current supporting inputs").textContent!,
    );
    expect(current).toHaveLength(1);
    expect(current[0].value).toBe("MREACHINGS");
    expect(current[0].chain_ids).toEqual(["B"]);
    if (removed === "uploading") expect(current[0].unpaired_msa).toBeFalsy();
    else expect(current[0].unpaired_msa).toBe(asset.id);
  },
);

it.each(["unpaired-first", "paired-first"] as const)(
  "retains independent supporting files and later setup in %s order",
  async (order) => {
    const asset = {
      id: "11111111-1111-4111-8111-111111111111",
      kind: "msa" as const,
      name: "controlled.a3m",
      sha256: "a".repeat(64),
      suffix: ".a3m",
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
    render(<SupportingFiles studyInputs />);
    const study = screen.getByRole("article", { name: /^Protein 1$/ });
    const sequence = within(study).getByRole("textbox", {
      name: "One-letter amino-acid sequence",
    });
    await user.click(within(study).getByText("Chains and modifications"));
    await user.upload(
      screen.getAllByLabelText("Upload Unpaired A3M")[0],
      new File(["controlled transport"], asset.name),
    );
    await user.upload(
      screen.getAllByLabelText("Upload Paired A3M (optional)")[0],
      new File(["controlled transport"], asset.name),
    );
    expect(replies).toHaveLength(2);
    await user.click(
      screen.getByRole("button", { name: "Update later setup" }),
    );
    const paired = { ...asset, id: "22222222-2222-4222-8222-222222222222" };
    for (const index of order === "unpaired-first" ? [0, 1] : [1, 0]) {
      await act(async () => replies[index](index === 0 ? asset : paired));
      const intermediate = JSON.parse(
        screen.getByLabelText("Current supporting inputs").textContent!,
      );
      expect(intermediate[0][index === 0 ? "unpaired_msa" : "paired_msa"]).toBe(
        index === 0 ? asset.id : paired.id,
      );
    }
    const current = JSON.parse(
      screen.getByLabelText("Current supporting inputs").textContent!,
    );
    expect(current[0].unpaired_msa).toBe(asset.id);
    expect(current[0].paired_msa).toBe(paired.id);
    expect(
      within(study).getByRole("textbox", {
        name: "One-letter amino-acid sequence",
      }),
    ).toBe(sequence);
    const dependent = JSON.parse(
      screen.getByLabelText("Supporting dependent inputs").textContent!,
    );
    expect(dependent.cycles).toBe(7);
    expect(dependent.bonds).toHaveLength(1);
  },
);

it.each(["sequence", "feature mode"] as const)(
  "cancels a supporting reply after its %s changes without remounting study fields",
  async (change) => {
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
    render(<SupportingFiles studyInputs />);
    const study = screen.getByRole("article", { name: /^Protein 1$/ });
    const sequence = within(study).getByRole("textbox", {
      name: "One-letter amino-acid sequence",
    });
    const advanced = within(study).getByText("Chains and modifications");
    await user.click(advanced);
    expect(advanced.closest("details")).toHaveAttribute("open");
    await user.upload(
      screen.getAllByLabelText("Upload Unpaired A3M")[0],
      new File(["controlled transport"], asset.name),
    );
    if (change === "sequence") await user.type(sequence, "G");
    else
      await user.selectOptions(
        screen.getByRole("combobox", {
          name: "Sequence evolutionary information",
        }),
        "none",
      );
    await act(async () => finish(asset));
    const current = JSON.parse(
      screen.getByLabelText("Current supporting inputs").textContent!,
    );
    expect(current[0].unpaired_msa).toBeFalsy();
    expect(
      within(study).getByRole("textbox", {
        name: "One-letter amino-acid sequence",
      }),
    ).toBe(sequence);
    expect(advanced.closest("details")).toHaveAttribute("open");
  },
);
