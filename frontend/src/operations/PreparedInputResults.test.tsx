import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import type { Job } from "../types";
import { PreparedInputResults } from "./PreparedInputResults";
import { preparedEntities } from "./prepared-input-model";
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({
    urls,
    sourceSnapshot,
  }: {
    urls: string[];
    sourceSnapshot: boolean;
  }) => (
    <output>
      {sourceSnapshot ? "Original source: " : "Computed: "}
      {urls.join(",")}
    </output>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
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
  expect(screen.getByRole("heading", { name: "蛋白序列" })).toBeVisible();
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.queryByRole("button", { name: "查看组分" })).toBeNull();
  expect(
    screen.getByRole("link", { name: "预测输入 1 · JSON" }),
  ).toHaveAttribute("href", expect.stringContaining("prepared-input.json"));
  expect(screen.getByText(/不产生预测三维构象/)).toBeVisible();
});

const protein = (sequence: string) => ({
  sequences: [{ proteinChain: { sequence, count: 1 } }],
});
const importJob = (id: string, assets: string[] = []) =>
  ({ id, request: { operation: "json", assets } }) as Job;

it("retains keyboard tabs for real multiple inputs and keeps the original structure selector independent", async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json([
        protein("ACDE"),
        { sequences: [{ ligand: { ligand: "CCD_JQ1", count: 2 } }] },
      ]),
    ),
  );
  const user = userEvent.setup();
  render(
    <PreparedInputResults
      job={importJob("import", ["asset-one", "asset-two"])}
      documents={["saved.json"]}
      language="en"
    />,
  );
  const first = await screen.findByRole("tab", { name: "Component 1" });
  first.focus();
  await user.keyboard("{ArrowRight}");
  expect(
    screen.getByRole("tab", { name: "Component 2", selected: true }),
  ).toHaveFocus();
  expect(screen.getByText(/JQ1.*2/)).toBeVisible();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Original input" }),
    "1",
  );
  expect(
    screen.getByText("Original source: /api/assets/asset-two"),
  ).toBeVisible();
  const original = screen.getByText("Original source: /api/assets/asset-two");
  const viewComponents = screen.getByRole("button", {
    name: "View components",
  });
  const componentRegion = screen.getByRole("region", {
    name: "Input components",
  });
  expect(viewComponents).toHaveAttribute("aria-controls", componentRegion.id);
  await user.click(viewComponents);
  expect(componentRegion).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Back to original 3D" }));
  expect(
    screen.getByRole("region", { name: "Original input structure" }),
  ).toHaveFocus();
  expect(screen.getByText("Original source: /api/assets/asset-two")).toBe(
    original,
  );
  expect(
    screen.getByRole("tab", { name: "Component 2", selected: true }),
  ).toBeVisible();
});

it("keeps a readable component and both downloads when one archived document cannot be read", async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("readable.json")
        ? Response.json(protein("ACDE"))
        : new Response("unavailable", { status: 404 }),
    ),
  );
  const user = userEvent.setup();
  render(
    <PreparedInputResults
      job={importJob("partial")}
      documents={["readable.json", "missing.json"]}
      language="en"
    />,
  );
  expect(
    await screen.findByRole("heading", { name: "Protein sequence" }),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Some inputs cannot be previewed",
  );
  await user.click(screen.getByText("Original JSON (2)"));
  expect(
    screen.getByRole("link", { name: "Prediction input 1 · JSON" }),
  ).toHaveAttribute("href", expect.stringContaining("name=readable.json"));
  expect(
    screen.getByRole("link", { name: "Prediction input 2 · JSON" }),
  ).toHaveAttribute("href", expect.stringContaining("name=missing.json"));
});

it("does not display the previous job's delayed input document", async () => {
  vi.stubGlobal("crypto", webcrypto);
  let finish!: (response: Response) => void;
  const old = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const fetch = vi.fn((url: string) =>
    url.includes("/old/") ? old : Promise.resolve(Response.json(protein("GG"))),
  );
  vi.stubGlobal("fetch", fetch);
  const { rerender } = render(
    <PreparedInputResults
      job={importJob("old")}
      documents={["same.json"]}
      language="en"
    />,
  );
  rerender(
    <PreparedInputResults
      job={importJob("new")}
      documents={["same.json"]}
      language="en"
    />,
  );
  expect(
    await screen.findByRole("button", { name: "Protein sequence · 1 G" }),
  ).toBeVisible();
  await act(async () => {
    finish(Response.json(protein("CCCC")));
    await old;
  });
  expect(
    screen.getByRole("button", { name: "Protein sequence · 1 G" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Protein sequence · 1 C" }),
  ).toBeNull();
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
