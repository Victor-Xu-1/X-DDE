import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { BoltzInputs } from "./BoltzInputs";
import {
  boltzMaterialInputs,
  boltzMsaKey,
  type BoltzComponent,
} from "./boltz-inputs";
import type { ScientificPayload } from "./types";

afterEach(() => vi.restoreAllMocks());
const asset = {
  id: "11111111-1111-4111-8111-111111111111",
  sha256: "a".repeat(64),
  name: "protein.a3m",
  kind: "msa" as const,
  suffix: ".a3m",
  size: 25,
  created_at: "",
};

function InputFixture() {
  const [payload, setPayload] = useState<ScientificPayload>({
    kind: "boltz",
    components: [
      { id: "A", kind: "protein", value: "ACDE", msa_mode: "provided" },
    ],
  });
  const [verified, setVerified] = useState<Record<string, string>>({});
  const components = payload.components as BoltzComponent[];
  return (
    <>
      <BoltzInputs
        language="en"
        payload={payload}
        onChange={(patch) =>
          setPayload((current) => ({ ...current, ...patch }))
        }
        onMsaVerified={(chain, key) =>
          setVerified((current) =>
            current[chain] === key ? current : { ...current, [chain]: key },
          )
        }
      />
      <button
        disabled={
          !components.every(
            (c) =>
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
    </>
  );
}

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
  expect(
    screen.getByRole("combobox", { name: "Evolutionary information" }),
  ).toHaveValue("provided");
  await user.upload(
    screen.getByLabelText("Upload Chain A MSA"),
    new File([">q\nACDE\n>h\nAC-E\n"], "protein.a3m"),
  );
  await waitFor(() => expect(reply).toBeTypeOf("function"));
  expect(next).toBeDisabled();
  await act(async () =>
    reply({ rows: 2, unique_sequences: 2, columns: 4, name: "protein.a3m" }),
  );
  await waitFor(() => expect(next).toBeEnabled());
  expect(screen.getByLabelText("Bound inputs").textContent).toContain(
    asset.sha256,
  );
  await user.clear(screen.getByRole("textbox", { name: "Sequence" }));
  await user.type(screen.getByRole("textbox", { name: "Sequence" }), "ACDF");
  expect(next).toBeDisabled();
  expect(screen.getByLabelText("Bound inputs")).toHaveTextContent("[]");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Evolutionary information" }),
    "single",
  );
  expect(next).toBeEnabled();
  expect(screen.getByText(/omits evolutionary alignment/)).toBeVisible();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Evolutionary information" }),
    "provided",
  );
  expect(next).toBeDisabled();
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
