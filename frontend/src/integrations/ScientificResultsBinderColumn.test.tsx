import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScientificResults } from "./ScientificResults";
import type { Job } from "../types";
import type { NativeResult } from "./types";

vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <output aria-label="Selected native structure">{urls.join(",")}</output>
  ),
}));
vi.mock("../presentation/SequenceTrack", () => ({
  SequenceTrack: ({ sequence }: { sequence: string }) => (
    <output aria-label="Selected binder sequence">{sequence}</output>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The score/rejection contrast is from the real STAT6 two-design pilot.
// This UI fixture does not execute a model or validate its scientific accuracy.
function pilot(): NativeResult {
  return {
    operation: "boltzgen_design",
    program: "boltzgen",
    version: "0.3.2",
    candidates: [0.40377, 0.55614].map((value, i) => ({
      id: `binder-00${i + 1}`,
      artifact: `binder-00${i + 1}.cif`,
      geometry: "predicted_structure",
      metrics: [
        {
          name: "iptm",
          value,
          unit: "native score",
          method: "BoltzGen",
          meaning: "score",
        },
      ],
    })),
    metrics: [],
    interactions: [],
    validation_points: [],
    artifact_sha256: {},
    binder_quality: {
      source_artifact:
        "native/designs/final_ranked_designs/all_designs_metrics.csv",
      source_sha256: "a".repeat(64),
      attempted: 2,
      passed: 1,
      retained: 2,
      designs: [
        "AEEAIEALKLALELVKELDKDGSGKVDKEKLVKKVEEKLKGYPEEIILMVKGLISKADKDGDGYVDVAELERLINTAIEILNS",
        "GAAAAAAAGAAGGAYAGAVAGGAGEAAAAAAAAAGAAAGAAAADAAAAAAGAGAAAAAGAAAGGGDAAAIAAAAATGAAGGALGWALG",
      ].map((sequence, i) => ({
        native_id: `design_${i}.cif`,
        candidate_id: `binder-00${i + 1}`,
        sequence,
        passed: i === 0,
        failed_filters: i === 0 ? [] : ["pass_ALA_fraction_filter"],
        interface_confidence: i === 0 ? 0.40377 : 0.55614,
        complex_confidence: i === 0 ? 0.70048 : 0.6946,
        binder_refold_confidence: i === 0 ? 0.662 : 0.742,
        binder_refold_rmsd: i === 0 ? 0.59388 : 1.04244,
        complex_refold_rmsd: i === 0 ? 0.8832 : 1.00877,
        buried_area: i === 0 ? 1072.26758 : 788.61426,
      })),
    },
  };
}

it.each(["en", "zh"] as const)(
  "keeps rejection with the higher-scoring candidate across sorting, selection, search and task changes in %s",
  (language) => {
    const zh = language === "zh";
    const result = pilot();
    const { rerender } = render(
      <ScientificResults
        job={{ id: "pilot" } as Job}
        result={result}
        language={language}
      />,
    );
    const table = screen.getByRole("table", {
      name: zh ? "研究候选" : "Research candidates",
    });
    expect(
      within(within(table).getByRole("row", { name: /binder-001/ })).getByText(
        zh ? "通过" : "Pass",
      ),
    ).toBeVisible();
    expect(
      within(within(table).getByRole("row", { name: /binder-002/ })).getByText(
        zh ? "未通过" : "Rejected",
      ),
    ).toBeVisible();
    const sort = within(table).getByRole("button", {
      name: `${zh ? "排序" : "Sort"} iptm (native score)`,
    });
    fireEvent.click(sort);
    fireEvent.click(sort);
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
      "binder-002",
    );
    fireEvent.click(within(table).getByRole("button", { name: "binder-002" }));
    expect(
      screen.getByLabelText("Selected native structure"),
    ).toHaveTextContent("/api/jobs/pilot/download?name=binder-002.cif");
    expect(
      screen.getByRole("region", {
        name: zh ? "结合蛋白质量" : "Binder quality",
      }),
    ).toHaveTextContent(zh ? "未通过" : "Rejected");
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: zh ? "未通过" : "Rejected" },
    });
    expect(
      within(table).queryByRole("button", { name: "binder-001" }),
    ).toBeNull();
    expect(
      within(table).getByRole("button", { name: "binder-002" }),
    ).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    rerender(
      <ScientificResults
        job={{ id: "legacy" } as Job}
        result={{ ...result, binder_quality: null }}
        language={language}
      />,
    );
    for (const id of ["binder-001", "binder-002"])
      expect(
        within(screen.getByRole("row", { name: new RegExp(id) })).getByText(
          zh ? "未评估" : "Not assessed",
        ),
      ).toBeVisible();
    expect(
      screen.getByLabelText("Selected native structure"),
    ).toHaveTextContent("/api/jobs/legacy/download?name=binder-001.cif");
    rerender(
      <ScientificResults
        job={{ id: "prediction" } as Job}
        result={{
          ...result,
          program: "boltz",
          operation: "boltz_predict",
          binder_quality: null,
        }}
        language={language}
      />,
    );
    expect(
      screen.queryByRole("columnheader", { name: /Native filters|原生筛选/ }),
    ).toBeNull();
  },
);

it("exports the actual filter decision for a searched candidate with its original score and identity", async () => {
  let exported: Blob | undefined;
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((blob: Blob) => {
      exported = blob;
      return "blob:binder-export";
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(
    <ScientificResults
      job={{ id: "pilot" } as Job}
      result={pilot()}
      language="en"
    />,
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Rejected" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Export filtered rows" }));
  expect(exported).toBeDefined();
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(exported!);
  });
  expect(text).toContain('"Native filters"');
  expect(text).toContain('"binder-002","Rejected","0.55614"');
  expect(text).not.toContain('"binder-001"');
});
