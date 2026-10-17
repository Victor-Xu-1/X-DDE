import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CandidateTable } from "./CandidateTable";
import type { DatasetResult } from "./types";

vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ label }: { label: string }) => <img alt={label} />,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Retained native values exercise presentation precision; no inference is simulated.
const result = () =>
  ({
    program: "gnina",
    metadata: {},
    candidates: [
      {
        id: "original-1",
        display_name: "CHEMBL517122",
        supplier: "custom",
        smiles: "NC(=O)c1cnc(Nc2ccc(N3CCC(O)CC3)cc2)nc1NCc1ccccc1",
        docking_score: -5.11726,
        cnn_score: 0.4971223176,
        cnn_affinity: 5.1177735329,
        score: 0.10333027690649033,
      },
      {
        id: "original-2",
        display_name: "CHEMBL512894",
        supplier: "custom",
        smiles: "CS(=O)(=O)c1ccccc1CNc1nc(Nc2ccc(N3CCOCC3)cc2)ncc1C(N)=O",
        docking_score: -5.54978,
        cnn_score: 0.172907114,
        cnn_affinity: 4.7841925621,
        score: 0.07134711742401123,
      },
    ],
  }) as unknown as DatasetResult;

it.each(["en", "zh"] as const)(
  "shows CNN separately and preserves selection after sorting: %s",
  async (language) => {
    const user = userEvent.setup(),
      data = result(),
      onSelect = vi.fn(),
      zh = language === "zh";
    const original = JSON.stringify(data);
    render(
      <CandidateTable
        result={data}
        selected="original-1"
        language={language}
        onSelect={onSelect}
      />,
    );
    const table = screen.getByRole("table", {
      name: zh ? "候选分子" : "Candidates",
    });
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "CHEMBL517122",
    );
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("0.497");
    expect(within(table).getAllByRole("row")[2]).toHaveTextContent("-5.550");
    await user.click(within(table).getByRole("button", { name: /CNN/ }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "CHEMBL512894",
    );
    await user.click(
      screen.getByRole("button", { name: "CHEMBL512894" }),
    );
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(data.candidates[1]);
    expect(
      screen.getByRole("checkbox", {
        name: (zh ? "对比 " : "Compare ") + "CHEMBL517122",
      }),
    ).toBeVisible();
    expect(JSON.stringify(data)).toBe(original);
  },
);

it("keeps hidden model outputs and every native decimal in the actual CSV Blob", async () => {
  const user = userEvent.setup(),
    data = result();
  let exported!: Blob;
  vi.stubGlobal("URL", {
    createObjectURL: (blob: Blob) => {
      exported = blob;
      return "blob:csv-export";
    },
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(
    <CandidateTable
      result={data}
      selected="original-1"
      language="en"
      onSelect={vi.fn()}
    />,
  );
  expect(screen.queryByRole("columnheader", { name: /affinity/i })).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Export filtered rows" }),
  );
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(exported);
  });
  for (const exact of [
    "CNNscore",
    "CNNaffinity_model_output",
    "-5.11726",
    "0.4971223176",
    "5.1177735329",
    "0.07134711742401123",
  ])
    expect(text).toContain(exact);
});

it("never invents CNN values for an empirical-only run", () => {
  const data = result();
  data.candidates.forEach((row) => {
    row.cnn_score = null;
    row.cnn_affinity = null;
  });
  render(
    <CandidateTable
      result={data}
      selected="original-1"
      language="en"
      onSelect={vi.fn()}
    />,
  );
  expect(screen.queryByRole("columnheader", { name: /CNN/ })).toBeNull();
  expect(
    screen.getByRole("columnheader", { name: /Docking energy/ }),
  ).toBeVisible();
});
