import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { isResearchFile, isResearchField } from "./research-files";
import { ResultTree } from "../operations/OperationResults";
it("retains structures, sequences, tables and reports while excluding engineering attachments", () => {
  for (const name of [
    "BRD4-JQ1/complex.cif",
    "BRD4_receptor.pdb",
    "candidate_12.sdf",
    "trastuzumab.fasta",
    "admet-results.csv",
    "poses.tsv",
    "screening.xlsx",
    "report.html",
  ])
    expect(isResearchFile(name)).toBe(true);
  for (const name of [
    "result.json",
    "audit.csv",
    "source-manifest.csv",
    "runtime-lock.csv",
    "input_bindings.json",
    "stderr.log",
    "run.py",
    "environment.yml",
  ])
    expect(isResearchFile(name)).toBe(false);
});
it("keeps scores and scientific uncertainty without leaking paths or digests", () => {
  const native = {
    candidate_count: 12,
    metrics: { iptm: 0.81, rmsd: 1.72 },
    sequence: "EVQLVESGGGLVQPGGSLRLSCAAS",
    reason: "Insufficient interface coverage",
    metadata: { command: "private-command", token: "secret" },
    sha256: "private-digest",
    structure_path: "/private/job/result.pdb",
    versions: { python: "private-version" },
  };
  const original = JSON.stringify(native);
  render(<ResultTree value={native} zh={false} />);
  expect(screen.getByText("0.81")).toBeVisible();
  expect(screen.getByText("1.72")).toBeVisible();
  expect(screen.getByText(native.sequence)).toBeVisible();
  expect(screen.getByText(native.reason)).toBeVisible();
  expect(screen.queryByText(/private-|secret/)).toBeNull();
  expect(JSON.stringify(native)).toBe(original);
  expect(isResearchField("scoring_method")).toBe(true);
});
