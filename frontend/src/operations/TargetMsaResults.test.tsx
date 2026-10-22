import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { TargetMsaResults } from "./TargetMsaResults";
vi.mock("../presentation/alignment/AlignmentResults", () => ({
  AlignmentResults: ({ files }: { files: unknown[] }) => (
    <div>Complete native alignments: {files.length}</div>
  ),
}));
afterEach(cleanup);
const job = {
  id: "native",
  request: {
    operation: "harness",
    tool: "target-msa",
    payload: { sequence: "ACDE" },
  },
} as unknown as Job;
it("shows real portable alignments without the historical missing-file message", () => {
  render(
    <TargetMsaResults
      job={job}
      language="en"
      value={{
        alignment_depth: 2,
        alignment_files: [
          {
            artifact: "non_pairing.a3m",
            sha256: "a".repeat(64),
            bytes: 50,
            rows: 2,
            columns: 4,
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("Complete native alignments: 1")).toBeVisible();
  expect(screen.queryByText(/did not retain|no inferred alignment/)).toBeNull();
});
it("keeps historical query-only results honest and rejects malformed manifests", () => {
  const view = render(
    <TargetMsaResults job={job} language="en" value={{ alignment_depth: 2 }} />,
  );
  expect(screen.getByText(/historical result did not retain/)).toBeVisible();
  expect(screen.getByText("ACDE")).toBeVisible();
  view.rerender(
    <TargetMsaResults
      job={job}
      language="zh"
      value={{ alignment_files: [{ artifact: "../not-local.a3m" }] }}
    />,
  );
  expect(
    screen.getByText("比对文件描述无法验证，请下载原始结果。"),
  ).toBeVisible();
  expect(screen.queryByText(/Complete native alignments/)).toBeNull();
});
