import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ExampleActions } from "./ExampleActions";
import { hasReviewedReceptorComparison } from "./ReviewedReceptorComparison";
import captured from "./reviewed-receptor.fixture.json";
import type { ExampleInfo } from "./types";

const transport = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({
  request: transport.request,
  api: { post: transport.post },
}));
vi.mock("./ExampleJobResult", () => ({
  ExampleJobResult: ({ job }: { job: { id: string } }) => (
    <p>Native output {job.id}</p>
  ),
}));
vi.mock("./ExampleRecordResult", () => ({ ExampleRecordResult: () => null }));
const actual = captured as unknown as ExampleInfo;
const root = "59348536-7349-42a0-95ae-e76a7e07e78d";

beforeEach(() => {
  transport.post.mockReset();
  transport.request.mockReset().mockImplementation(async (path: string) => {
    if (path.startsWith("/examples/")) return actual;
    const id = path.split("/").at(-1);
    return {
      id,
      status: "succeeded",
      request:
        id === root
          ? { operation: "diffsbdd", payload: { mode: "diversify" } }
          : { operation: "pose_quality" },
    };
  });
});

it("recognizes independently captured installed metadata rather than a generated self-fixture", () => {
  expect(hasReviewedReceptorComparison(actual, root)).toBe(true);
});

it("rejects a changed result, molecule, receptor, quality report, version or case", () => {
  const changed = (edit: (info: ExampleInfo) => void) => {
    const info = structuredClone(actual);
    edit(info);
    expect(hasReviewedReceptorComparison(info, root)).toBe(false);
  };
  changed((v) => {
    v.module.revision++;
  });
  changed((v) => {
    v.module.case_id = "another-case";
  });
  changed((v) => {
    v.case.id = "another-case";
  });
  changed((v) => {
    v.module.capability_id = "diffsbdd.optimize";
  });
  changed((v) => {
    v.pin!.job_id = "another-job";
  });
  changed((v) => {
    v.pin!.review = null;
  });
  changed((v) => {
    v.pin!.artifact_sha256["result.json"] = "0".repeat(64);
  });
  changed((v) => {
    v.pin!.supporting_evidence = [];
  });
  for (const supporting of actual.pin!.supporting_evidence!) {
    for (const name of Object.keys(supporting.artifact_sha256)) {
      changed((v) => {
        v.pin!.supporting_evidence!.find(
          (entry) => entry.job_id === supporting.job_id,
        )!.artifact_sha256[name] = "0".repeat(64);
      });
    }
  }
  expect(hasReviewedReceptorComparison(actual, "another-active-job")).toBe(
    false,
  );
  expect(hasReviewedReceptorComparison(null, root)).toBe(false);
});

it.each(["zh", "en"] as const)(
  "opens exact retained quality and docking stages in the existing controller (%s)",
  async (language) => {
    const zh = language === "zh";
    render(
      <ExampleActions
        capability="diffsbdd.diversify"
        language={language}
        onLoad={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: zh ? "示例结果" : "Example results",
      }),
    );
    const summary = await screen.findByText(
      zh
        ? "候选 3 · 受体对照与姿势质控"
        : "Candidate 3 · receptor controls and pose quality",
      { selector: "summary" },
    );
    const panel = summary.closest("details")!;
    expect(panel).not.toHaveAttribute("open");
    fireEvent.click(summary);
    const table = screen.getByRole("table", {
      name: zh ? "受体与姿势对照" : "Receptor and pose comparison",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    for (const score of ["-7.29963", "-7.29302", "-6.36464"])
      expect(within(table).getByText(score)).toBeVisible();
    expect(
      within(table).getAllByText(
        zh
          ? "15 已测通过 · 6 未评估 · 1 不适用"
          : "15 measured passes · 6 unassessed · 1 not applicable",
      ),
    ).toHaveLength(3);
    expect(screen.getByText("4.61 Å")).toBeVisible();
    expect(screen.getByText("11.20 Å")).toBeVisible();
    const csv = decodeURIComponent(
      screen
        .getByRole("link", { name: zh ? "下载对照表" : "Download comparison" })
        .getAttribute("href")!
        .split(",")[1],
    );
    expect(csv.split("\r\n")).toHaveLength(4);
    expect(csv).toContain("predicted,2,-7.29302,15,6,1");
    fireEvent.click(
      within(table).getByRole("button", {
        name: zh
          ? "查看预测域模型姿势 2 的质控"
          : "Inspect Predicted domain pose 2 quality",
      }),
    );
    expect(panel).not.toHaveAttribute("open");
    const quality = "4949ff4c-17f0-4fd6-84fe-e1fc4f460778";
    expect(await screen.findByText(`Native output ${quality}`)).toBeVisible();
    expect(
      screen.getByRole("combobox", {
        name: zh ? "研究阶段结果" : "Study result stage",
      }),
    ).toHaveValue(quality);
    expect(screen.getByText(`Native output ${root}`)).not.toBeVisible();
    fireEvent.click(summary);
    fireEvent.click(
      screen.getByRole("button", {
        name: zh
          ? "查看9BIG 实验构建体的全部姿势"
          : "All 9BIG experimental construct poses",
      }),
    );
    expect(
      await screen.findByText(
        "Native output 2899703f-0bfd-46ba-85e6-5fec7a072610",
      ),
    ).toBeVisible();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: root } });
    expect(screen.getByText(`Native output ${root}`)).toBeVisible();
    expect(transport.post).not.toHaveBeenCalled();
  },
);
