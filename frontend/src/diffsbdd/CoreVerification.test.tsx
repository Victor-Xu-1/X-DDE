import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect } from "vitest";
import { CoreVerification } from "./CoreVerification";
import type { CoreVerificationData } from "./types";

const data: CoreVerificationData = {
  method: "rdkit_fixed_core_v1",
  preserve_bonds: true,
  qualified_count: 1,
  qualified_sha256: "a".repeat(64),
  candidates: [
    {
      record: 0,
      qualified_record: 0,
      diagnostic_artifact: null,
      status: "passed",
      reason: null,
      maximum_displacement: 0.02,
      mapping: [{ source_atom: 0, output_atom: 2 }],
    },
    {
      record: 1,
      qualified_record: null,
      diagnostic_artifact: "diagnostic-core-002.sdf",
      status: "indeterminate",
      reason: "stereo_crosses_fixed_boundary",
      maximum_displacement: null,
      mapping: [],
    },
  ],
};
it("explains independent qualification and exact mapping with diagnostic-only uncertainty", async () => {
  render(<CoreVerification data={data} jobId="job" language="zh" />);
  const user = userEvent.setup();
  await user.click(screen.getByText(/固定区域独立复核/));
  expect(screen.getByText(/候选 1 · 通过/)).toBeVisible();
  expect(screen.getByText(/候选 2 · 无法确认/)).toBeVisible();
  expect(screen.getByText(/请扩大固定区域/)).toBeVisible();
  await user.click(screen.getByText("查看已验证原子映射"));
  expect(screen.getByText("0 → 2")).toBeVisible();
  expect(screen.queryByRole("button", { name: /复用/ })).toBeNull();
});
it("does not claim bond preservation in atom-only mode and handles empty results", async () => {
  render(
    <CoreVerification
      data={{
        ...data,
        preserve_bonds: false,
        qualified_count: 0,
        candidates: [],
      }}
      jobId="job"
      language="en"
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByText(/Independent fixed-core verification/));
  expect(
    screen.getByText(/not proof of a preserved chemical core/),
  ).toBeVisible();
  expect(screen.getByText(/no candidate to verify/)).toBeVisible();
});
