import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Job } from "../types";
import { PreparedInputResults } from "./PreparedInputResults";
import { preparedEntities } from "./prepared-input-model";
afterEach(cleanup);
it("shows the original sequence for feature preparation jobs without claiming a predicted structure", () => {
  render(
    <PreparedInputResults
      language="zh"
      documents={["prepared-input.json"]}
      job={
        {
          id: "msa",
          request: {
            operation: "msa",
            components: [
              {
                kind: "protein",
                value:
                  "SMNPPPPETSNPNKPKRQTNQLQYLLRVVLKTLWKHQFAWPFQQPVDAVKLNLPDYYKIIKTPMDMGTIKKRLENNYYWNAQECIQDFNT",
                count: 1,
                chain_ids: ["A"],
              },
            ],
          },
        } as Job
      }
    />,
  );
  expect(
    screen.getByRole("button", { name: "下载此序列 FASTA" }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "预测输入 1 · JSON" }),
  ).toHaveAttribute("href", expect.stringContaining("prepared-input.json"));
  expect(screen.getByText(/不产生预测三维构象/)).toBeVisible();
});
it("keeps native CCD identifiers distinct from molecular text and retains all converted entities", () => {
  const rows = preparedEntities([
    {
      name: "3MXF",
      sequences: [
        {
          proteinChain: {
            sequence: "SMNPPPPETSNPNKPKRQTNQLQYLLRVVLKTLWKHQFAWP",
            count: 1,
          },
        },
        { ligand: { ligand: "CCD_JQ1", count: 1 } },
        { ligand: { ligand: "CCD_EDO", count: 3 } },
      ],
    },
  ]);
  expect(rows).toHaveLength(3);
  expect(rows[1]).toMatchObject({ ccd: "JQ1", count: 1 });
  expect(rows[1].smiles).toBeUndefined();
  expect(rows[2].count).toBe(3);
});
