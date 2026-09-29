import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { HomeWorkspace } from "./HomeWorkspace";
import { defaults } from "../form-model";
const props: ComponentProps<typeof HomeWorkspace> = {
  resultsVersion: 0,
  language: "zh",
  ready: true,
  health: null,
  connectionError: false,
  onRefresh: vi.fn(),
  jobs: [],
  job: {
    id: "job",
    request: {
      name: "已完成的任务",
      components: [{ kind: "protein", value: "ACDE", count: 1 }],
      parameters: defaults,
    },
    status: "succeeded",
    created_at: "2026-09-30",
    started_at: null,
    finished_at: null,
    error: null,
    parent_id: null,
  },
  detail: null,
  detailError: false,
  onJob: vi.fn(),
  onChanged: vi.fn(),
  projects: [],
  projectId: null,
  onProject: vi.fn(),
  analysis: null,
  loadingAnalysis: false,
  analysisError: "",
  onRetry: vi.fn(),
  onCandidate: vi.fn(),
  urls: [],
  compared: [],
  onCompare: vi.fn(),
  focusResidue: null,
  onResidue: vi.fn(),
  draft: null,
  onReuse: vi.fn(),
  onSubmit: vi.fn(),
};
it("separates task entry from structure review while preserving the draft", () => {
  const { rerender } = render(<HomeWorkspace {...props} />);
  const sequence = screen.getByLabelText("单字母氨基酸序列");
  fireEvent.change(sequence, { target: { value: "ACDE" } });
  fireEvent.click(screen.getByRole("button", { name: "结构与结果" }));
  expect(sequence).not.toBeVisible();
  expect(screen.getByTitle("可交互分子结构")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "新建预测" }));
  expect(sequence).toBeVisible();
  expect(sequence).toHaveValue("ACDE");
  rerender(<HomeWorkspace {...props} resultsVersion={1} />);
  expect(sequence).not.toBeVisible();
  expect(
    screen.getByRole("heading", { name: "已完成的任务 已完成" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "小分子性质" }),
  ).not.toBeInTheDocument();
});
