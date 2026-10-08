import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { ReceptorResults } from "./ReceptorResults";
import type { ReceptorResult, MemberEvidence, ReceptorSet } from "./types";
import type { Job } from "../types";
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: unknown) => (
    <output data-testid="receptor-preview">{JSON.stringify(props)}</output>
  ),
}));
vi.mock("../pockets/PocketForm", () => ({
  PocketForm: (props: unknown) => (
    <output data-testid="pocket-input">{JSON.stringify(props)}</output>
  ),
}));
vi.mock("../sites/SiteWorkspace", () => ({ SiteWorkspace: () => null }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const reference = (index: number) => ({
  asset_id: "original-" + index,
  sha256: "b".repeat(64),
  version_id: "receptor-v" + index,
  record: 0,
  conformer: 0,
});
function member(
  index: number,
  status: MemberEvidence["status"],
): MemberEvidence {
  return {
    index,
    status,
    source: {
      structure: reference(index),
      selection: {
        model_index: 0,
        chains: ["A"],
        profile: "experimental",
        chain_pairs: [],
        residue_pairs: [],
      },
    },
    artifact: status === "rejected" ? null : "aligned-" + index + ".pdb",
    artifact_sha256: null,
    reason: status === "rejected" ? "No reliable atom correspondence" : null,
    correspondence: {
      method: "sequence",
      pair_count: 120,
      identity: 0.987654321,
      coverage: 0.998765432,
    },
    transformation:
      status === "aligned"
        ? {
            rotation: [],
            translation: [],
            rmsd_angstrom: 1.23456789,
            residue_pairs: [],
          }
        : null,
    quality: {
      atom_count: 2000,
      selected_model_index: 0,
      selected_chains: ["A"],
      backbone_complete: true,
      incomplete_backbone: [],
      protein_chains: [],
      parser_warnings: [],
      source_profile: "experimental",
    },
  };
}
const data = {
  operation: "receptor_ensemble",
  members: [
    member(0, "reference"),
    member(1, "aligned"),
    member(2, "rejected"),
  ],
  options: { reference_index: 0 },
  qualified_count: 2,
  collection_status: "partial",
  versions: {},
} as ReceptorResult;
const job = { id: "native-job" } as Job;
function boundary() {
  vi.spyOn(client, "request").mockResolvedValue([
    {
      id: "registered",
      source_job: job.id,
      members: data.members.map((row) => ({
        evidence: row,
        reference: row.status === "rejected" ? null : reference(row.index),
      })),
    },
  ] as ReceptorSet[]);
}
const props = (id: string) => JSON.parse(screen.getByTestId(id).textContent!);

it("links the selected member to its actual aligned overlay and original/aligned downloads", async () => {
  boundary();
  const user = userEvent.setup();
  render(<ReceptorResults job={job} data={data} language="en" />);
  expect(screen.getByRole("button", { name: "Receptor 2" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(props("receptor-preview")).toMatchObject({
    comparison: true,
    urls: [
      client.artifactUrl(job.id, "aligned-0.pdb"),
      client.artifactUrl(job.id, "aligned-1.pdb"),
    ],
  });
  expect(screen.getByTitle("1.23456789")).toHaveTextContent("1.23457");
  expect(
    screen.getByRole("link", { name: "Download original structure" }),
  ).toHaveAttribute("href", "/api/assets/original-1");
  expect(
    screen.getByRole("link", { name: "Download aligned structure" }),
  ).toHaveAttribute("href", client.artifactUrl(job.id, "aligned-1.pdb"));
  await user.click(screen.getByRole("button", { name: "Receptor 1" }));
  expect(props("receptor-preview")).toMatchObject({
    comparison: false,
    urls: [client.artifactUrl(job.id, "aligned-0.pdb")],
  });
  expect(screen.getByText("One structure is displayed.")).toBeVisible();
});

it("makes rejected members inspectable without retaining another member's overlay or handoff", async () => {
  boundary();
  const user = userEvent.setup();
  render(<ReceptorResults job={job} data={data} language="en" />);
  await user.click(screen.getByRole("button", { name: "Receptor 3" }));
  expect(screen.getByText("No reliable atom correspondence")).toBeVisible();
  expect(screen.queryByTestId("receptor-preview")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Find pockets on this receptor" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Download original structure" }),
  ).toHaveAttribute("href", "/api/assets/original-2");
});

it("hands the exact saved member to a separate pocket questionnaire and retains the selection on return", async () => {
  boundary();
  const user = userEvent.setup();
  render(<ReceptorResults job={job} data={data} language="en" />);
  await user.click(
    await screen.findByRole("button", {
      name: "Find pockets on this receptor",
    }),
  );
  expect(props("pocket-input").initialProtein).toEqual(reference(1));
  expect(screen.queryByTestId("receptor-preview")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "← Back to results" }));
  expect(screen.getByRole("button", { name: "Receptor 2" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("keeps native visualization and downloads available if asset registration fails", async () => {
  vi.spyOn(client, "request").mockRejectedValue(
    new Error("Indexing unavailable"),
  );
  render(<ReceptorResults job={job} data={data} language="en" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Indexing unavailable",
  );
  expect(screen.getByTestId("receptor-preview")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Download aligned structure" }),
  ).toBeVisible();
});
