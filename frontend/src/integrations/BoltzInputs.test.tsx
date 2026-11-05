import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { BoltzInputs, type BoltzInputRow } from "./BoltzInputs";
import { validBoltzComponents } from "./validation";
import {
  boltzMaterialInputs,
  boltzMsaKey,
  type BoltzComponent,
} from "./boltz-inputs";

afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal)
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: {
        configurable: true,
        value() {
          this.setAttribute("open", "");
        },
      },
      close: {
        configurable: true,
        value() {
          this.removeAttribute("open");
        },
      },
    });
});
const asset = {
  id: "11111111-1111-4111-8111-111111111111",
  sha256: "a".repeat(64),
  name: "protein.a3m",
  kind: "msa" as const,
  suffix: ".a3m",
  size: 25,
  created_at: "",
};

function InputFixture({
  initial = [{ id: "A", kind: "protein", value: "ACDE", msa_mode: "provided" }],
}: {
  initial?: BoltzComponent[];
}) {
  const [rows, setRows] = useState<BoltzInputRow[]>(
    initial.map((component, index) => ({
      component,
      key: String(index),
      revision: 0,
    })),
  );
  const [verified, setVerified] = useState<Record<string, string>>({});
  const components = rows.map((row) => row.component);
  return (
    <>
      <BoltzInputs
        language="en"
        rows={rows}
        onRows={setRows}
        onMsaVerified={(chain, key) =>
          setVerified((current) =>
            current[chain] === key ? current : { ...current, [chain]: key },
          )
        }
      />
      <button
        disabled={
          !validBoltzComponents(components, false) ||
          !components.every(
            (c) =>
              c.kind !== "protein" ||
              c.msa_mode === "single" ||
              Boolean(c.msa && verified[c.id] === boltzMsaKey(c)),
          )
        }
      >
        Continue
      </button>
      <output aria-label="Bound inputs">
        {JSON.stringify(boltzMaterialInputs(components))}
      </output>
      <output aria-label="Current components">
        {JSON.stringify(components)}
      </output>
    </>
  );
}

it("stages chain MSA settings without silently changing the native provided-alignment default", async () => {
  const user = userEvent.setup();
  render(<InputFixture />);
  const trigger = screen.getByRole("button", { name: "Chain A MSA settings" });
  expect(trigger).toHaveTextContent("MSA file");
  expect(screen.queryByLabelText("Upload Chain A MSA")).not.toBeInTheDocument();
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "MSA settings" });
  await user.click(
    within(dialog).getByRole("radio", { name: "Single sequence" }),
  );
  expect(screen.getByLabelText("Current components")).toHaveTextContent(
    '"msa_mode":"provided"',
  );
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(trigger).toHaveFocus();
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  await user.click(trigger);
  expect(screen.getByRole("radio", { name: "MSA file" })).toBeChecked();
  await user.click(screen.getByRole("radio", { name: "Single sequence" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  expect(trigger).toHaveTextContent("Single sequence");
});

it("defaults to a fresh alignment, blocks pending checks and clears a changed protein", async () => {
  let reply!: (value: unknown) => void;
  vi.spyOn(api, "upload").mockResolvedValue(asset);
  vi.spyOn(api, "authorized").mockImplementation(
    async () =>
      new Promise((resolve) => {
        reply = resolve as (value: unknown) => void;
      }) as never,
  );
  const user = userEvent.setup();
  render(<InputFixture />);
  const next = screen.getByRole("button", { name: "Continue" });
  expect(next).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Chain A MSA settings" }),
  );
  expect(screen.getByRole("radio", { name: "MSA file" })).toBeChecked();
  await user.upload(
    screen.getByLabelText("Upload Chain A MSA"),
    new File([">q\nACDE\n>h\nAC-E\n"], "protein.a3m"),
  );
  await waitFor(() => expect(reply).toBeTypeOf("function"));
  expect(next).toBeDisabled();
  await act(async () =>
    reply({ rows: 2, unique_sequences: 2, columns: 4, name: "protein.a3m" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
  );
  expect(next).toBeDisabled();
  expect(screen.getByLabelText("Bound inputs")).toHaveTextContent("[]");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(next).toBeEnabled());
  expect(screen.getByLabelText("Bound inputs").textContent).toContain(
    asset.sha256,
  );
  await user.clear(screen.getByRole("textbox", { name: "Sequence" }));
  await user.type(screen.getByRole("textbox", { name: "Sequence" }), "ACDF");
  expect(next).toBeDisabled();
  expect(screen.getByLabelText("Bound inputs")).toHaveTextContent("[]");
  await user.click(
    screen.getByRole("button", { name: "Chain A MSA settings" }),
  );
  await user.click(screen.getByRole("radio", { name: "Single sequence" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(next).toBeEnabled();
  expect(screen.getByText(/omits evolutionary alignment/)).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Chain A MSA settings" }),
  );
  await user.click(screen.getByRole("radio", { name: "MSA file" }));
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  // Unsaved mode changes cannot replace the valid committed single-sequence task.
  // The real native dialog makes the underlying Next button inert.
  expect(screen.getByLabelText("Current components")).toHaveTextContent(
    '"msa_mode":"single"',
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(next).toBeEnabled();
});

it("discards a cancelled upload even if its response arrives after closing the chain window", async () => {
  let finish!: (value: typeof asset) => void;
  vi.spyOn(api, "upload").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<InputFixture />);
  await user.click(
    screen.getByRole("button", { name: "Chain A MSA settings" }),
  );
  await user.upload(
    screen.getByLabelText("Upload Chain A MSA"),
    new File([">q\nACDE\n"], "protein.a3m"),
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () => finish(asset));
  expect(screen.getByLabelText("Bound inputs")).toHaveTextContent("[]");
  await user.click(
    screen.getByRole("button", { name: "Chain A MSA settings" }),
  );
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.queryByText(asset.name)).not.toBeInTheDocument();
});

it("keeps a committed alignment on cancel and atomically clears it on explicit single-sequence save", async () => {
  const reference = {
    asset_id: asset.id,
    sha256: asset.sha256,
    record: 0,
    conformer: 0,
    version_id: "version-kept",
  };
  vi.spyOn(api, "authorized").mockResolvedValue({
    rows: 2,
    unique_sequences: 2,
    columns: 4,
    name: asset.name,
  });
  const user = userEvent.setup();
  render(
    <InputFixture
      initial={[
        {
          id: "A",
          kind: "protein",
          value: "ACDE",
          msa: reference,
          msa_mode: "provided",
        },
      ]}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled(),
  );
  await user.click(
    screen.getByRole("button", { name: "Chain A MSA settings" }),
  );
  await user.click(screen.getByRole("radio", { name: "Single sequence" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled(),
  );
  expect(screen.getByLabelText("Bound inputs")).toHaveTextContent(
    "version-kept",
  );
  await user.click(
    screen.getByRole("button", { name: "Chain A MSA settings" }),
  );
  await user.click(screen.getByRole("radio", { name: "Single sequence" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByLabelText("Bound inputs")).toHaveTextContent("[]");
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
});

it.each(["remove", "edit"] as const)(
  "ignores an older ligand upload after the user chooses to %s its row",
  async (action) => {
    const ligand = {
      ...asset,
      kind: "ligand" as const,
      name: "ligand.sdf",
      suffix: ".sdf",
    };
    let finish!: (value: typeof ligand) => void;
    vi.spyOn(api, "upload").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith(`/assets/${ligand.id}/metadata`)
        ? Response.json(ligand)
        : new Response(null, { status: 404 }),
    );
    const user = userEvent.setup();
    render(
      <InputFixture
        initial={[
          { id: "A", kind: "ligand", value: "" },
          { id: "B", kind: "ligand", value: "" },
        ]}
      />,
    );
    await user.upload(
      screen.getAllByLabelText("Upload Upload molecular structure")[0],
      new File(["test"], ligand.name),
    );
    expect(finish).toBeTypeOf("function");
    if (action === "remove") {
      await user.click(
        screen.getAllByRole("button", { name: "Remove component" })[0],
      );
    } else {
      await user.type(
        screen.getAllByRole("textbox", { name: "SMILES" })[0],
        "CCO",
      );
    }
    await act(async () => finish(ligand));
    expect(screen.getByLabelText("Bound inputs")).toHaveTextContent("[]");
    const components = JSON.parse(
      screen.getByLabelText("Current components").textContent!,
    );
    expect(
      components.map(({ id, value }: BoltzComponent) => [id, value]),
    ).toEqual(
      action === "remove"
        ? [["B", ""]]
        : [
            ["A", "CCO"],
            ["B", ""],
          ],
    );
  },
);

it("invalidates old SMILES immediately and accepts only one concurrently selected ligand file", async () => {
  const ligand = {
    ...asset,
    kind: "ligand" as const,
    name: "ligand.sdf",
    suffix: ".sdf",
  };
  const pending: Array<(value: typeof ligand) => void> = [];
  vi.spyOn(api, "upload").mockImplementation(
    () => new Promise((resolve) => pending.push(resolve)),
  );
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
    String(url).endsWith(`/assets/${ligand.id}/metadata`)
      ? Response.json(ligand)
      : new Response(null, { status: 404 }),
  );
  const user = userEvent.setup();
  render(
    <InputFixture
      initial={[
        { id: "A", kind: "protein", value: "ACDE", msa_mode: "single" },
        { id: "B", kind: "ligand", value: "CCO" },
        { id: "C", kind: "ligand", value: "CCN" },
      ]}
    />,
  );
  const next = screen.getByRole("button", { name: "Continue" });
  expect(next).toBeEnabled();
  const uploads = screen.getAllByLabelText("Upload Upload molecular structure");
  await user.upload(uploads[0], new File(["first"], ligand.name));
  expect(next).toBeDisabled();
  await user.upload(uploads[1], new File(["second"], ligand.name));
  expect(pending).toHaveLength(2);
  await act(async () => pending.forEach((resolve) => resolve(ligand)));
  const components = JSON.parse(
    screen.getByLabelText("Current components").textContent!,
  ) as BoltzComponent[];
  expect(components.filter((row) => row.source)).toHaveLength(1);
  expect(
    screen.getAllByLabelText("Upload Upload molecular structure"),
  ).toHaveLength(1);
  expect(next).toBeDisabled();
  await user.type(screen.getAllByRole("textbox", { name: "SMILES" })[1], "CCN");
  expect(next).toBeEnabled();
});

it("deduplicates shared protein alignments without conflating ligand and MSA roles", () => {
  const msa = {
    asset_id: asset.id,
    sha256: asset.sha256,
    record: 0,
    conformer: 0,
  };
  expect(
    boltzMaterialInputs([
      { id: "A", kind: "protein", value: "ACDE", msa },
      { id: "B", kind: "protein", value: "ACDE", msa },
      { id: "L", kind: "ligand", value: "", source: msa },
    ]),
  ).toEqual([
    { role: "msa", source: msa },
    { role: "ligand", source: msa },
  ]);
});
