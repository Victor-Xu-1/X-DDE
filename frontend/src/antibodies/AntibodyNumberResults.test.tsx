import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { AntibodyNumberResult } from "./types";
import { AntibodyNumberResults } from "./AntibodyNumberResults";
afterEach(cleanup);
it("hands off the exact saved domain sequence and exposes failed inputs without invented domains", async () => {
  const ref = {
    asset_id: "domain-file",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
    version_id: "domain-version",
  };
  const domain = {
    id: "chain",
    source_id: "chain",
    available: true,
    chain_type: "K",
    score: 30,
    start: 0,
    end: 2,
    sequence: "CDE",
    numbering: [
      {
        number: 27,
        insertion: "",
        amino_acid: "C",
        source_position: 1,
        region: "CDR1",
      },
      {
        number: 28,
        insertion: "",
        amino_acid: "D",
        source_position: 2,
        region: "CDR1",
      },
      {
        number: 29,
        insertion: "",
        amino_acid: "E",
        source_position: 3,
        region: "CDR1",
      },
    ],
    artifact: "domain-000.fasta",
    sha256: ref.sha256,
    reference: ref,
    reason: null,
  };
  const result = {
    domains: [
      domain,
      {
        id: "failed",
        source_id: "failed",
        available: false,
        chain_type: "F",
        score: 0,
        reason: "Native model could not number",
      },
    ],
  } as unknown as AntibodyNumberResult;
  const user = userEvent.setup(),
    draft = vi.fn();
  render(
    <AntibodyNumberResults
      job={{ id: "job" } as Job}
      result={result}
      language="en"
      onDraft={draft}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Predict this domain structure" }),
  );
  expect(draft).toHaveBeenCalledWith(
    expect.objectContaining({
      components: [
        expect.objectContaining({
          value: "CDE",
          source_sequence: "domain-file",
        }),
      ],
      scientific_inputs: [ref],
    }),
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Which input/domain?" }),
    "1",
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Native model could not number this input",
  );
  expect(
    screen.queryByRole("button", { name: "Predict this domain structure" }),
  ).toBeNull();
  expect(
    screen.queryByRole("link", { name: "Download this domain sequence" }),
  ).toBeNull();
});
