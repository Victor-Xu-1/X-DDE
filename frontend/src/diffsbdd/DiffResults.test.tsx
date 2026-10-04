import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DiffResults } from "./DiffResults";
import { artifactUrl, api } from "../api";
import * as client from "../api";
import type { Job } from "../types";
import { artifactInfo } from "../presentation/artifact-digest";
vi.mock("../presentation/artifact-digest", () => ({
  artifactInfo: vi.fn(async () => ({ sha256: "a".repeat(64), records: 1 })),
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <output data-testid="native-preview">{urls.join("|")}</output>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("previews the retained native molecule file even before scientific objects are registered", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  vi.spyOn(api, "assets").mockResolvedValue([]);
  const submit = vi.spyOn(api, "submit"),
    name = "native/20261002T021243Z_reviewed/molecules.sdf";
  render(
    <DiffResults
      language="zh"
      job={
        {
          id: "case",
          request: { operation: "diffsbdd", payload: { mode: "generate" } },
        } as unknown as Job
      }
      data={{
        operation: "diffsbdd",
        complete: true,
        molecule_artifact: name,
        protein_artifact: "native/protein.pdb",
      }}
    />,
  );
  expect(
    (await screen.findAllByTestId("native-preview")).map(
      (node) => node.textContent,
    ),
  ).toContain(artifactUrl("case", name));
  const link = screen.getByRole("link", { name: "分子结构 · SDF" });
  expect(link).toHaveAttribute("href", artifactUrl("case", name));
  expect(link).toHaveAttribute("title", "molecules.sdf");
  expect(screen.queryByText(name, { exact: true })).not.toBeInTheDocument();
  await waitFor(() => expect(client.request).toHaveBeenCalled());
  expect(
    await screen.findByRole("table", { name: "生成的候选分子" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "计算这个候选的性质" }),
  ).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

it("does not open an empty SDF when no candidate passed scientific checks", () => {
  render(
    <DiffResults
      language="zh"
      job={
        {
          id: "empty",
          request: { operation: "diffsbdd", payload: { mode: "inpaint" } },
        } as unknown as Job
      }
      data={{
        operation: "diffsbdd",
        complete: true,
        valid: 0,
        attempted: 3,
        molecule_artifact: "qualified-molecules.sdf",
      }}
    />,
  );
  expect(screen.queryByTestId("native-preview")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(
    "没有得到符合要求的候选",
  );
});

it("shows native candidates by output digest even when their original asset names differ", async () => {
  vi.spyOn(client, "request").mockResolvedValue([
    {
      id: "native-1",
      kind: "molecule",
      label: "Retained candidate",
      source_job: "case",
      reference: {
        asset_id: "source-asset",
        sha256: "a".repeat(64),
        record: 0,
        conformer: 0,
      },
    },
    {
      id: "wrong-output",
      kind: "molecule",
      label: "Another output",
      source_job: "case",
      reference: {
        asset_id: "other",
        sha256: "b".repeat(64),
        record: 0,
        conformer: 0,
      },
    },
  ] as never);
  const listing = vi.spyOn(api, "assets");
  render(
    <DiffResults
      language="en"
      job={
        {
          id: "case",
          request: { operation: "diffsbdd", payload: { mode: "generate" } },
        } as unknown as Job
      }
      data={{
        operation: "diffsbdd",
        complete: true,
        valid: 1,
        molecule_artifact: "qualified-molecules.sdf",
      }}
    />,
  );
  expect(
    await screen.findByRole("button", { name: "Candidate 1" }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Candidate 2" })).toBeNull();
  expect(listing).not.toHaveBeenCalled();
});

it("does not display or reuse a file whose records disagree with its qualified scientific receipt", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  vi.mocked(artifactInfo).mockResolvedValueOnce({
    sha256: "b".repeat(64),
    records: 1,
  });
  render(
    <DiffResults
      language="en"
      job={
        {
          id: "changed",
          request: { operation: "diffsbdd", payload: { mode: "inpaint" } },
        } as unknown as Job
      }
      data={{
        operation: "diffsbdd",
        complete: true,
        valid: 1,
        molecule_artifact: "qualified-molecules.sdf",
        core_verification: {
          qualified_sha256: "a".repeat(64),
          qualified_count: 1,
          method: "rdkit_fixed_core_v1",
          preserve_bonds: true,
          candidates: [
            {
              record: 0,
              qualified_record: 0,
              diagnostic_artifact: null,
              status: "passed",
              reason: null,
              maximum_displacement: 0,
              mapping: [],
            },
          ],
        },
      }}
    />,
  );
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(
    screen.queryByRole("table", { name: "Generated candidate molecules" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: "Calculate this candidate's properties",
    }),
  ).toBeNull();
});
