import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { artifactUrl } from "../api";
import { StructurePrepareResults } from "./StructurePrepareResults";
import {
  preparationDefaults,
  type StructurePrepareResult,
} from "./preparation-types";
import type { Job } from "../types";

vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: () => <div>Saved native structure</div>,
}));
vi.mock("../utilities/TaskBackendControl", () => ({
  FollowupBackendControl: ({ capability }: { capability: string }) => (
    <span>{capability}</span>
  ),
}));
vi.mock("../pockets/PocketForm", () => ({
  PocketForm: ({ initialProtein }: { initialProtein: unknown }) => (
    <output aria-label="Pocket input">{JSON.stringify(initialProtein)}</output>
  ),
}));

afterEach(cleanup);
const job = { id: "preparation" } as Job;
const source = {
  asset_id: "source",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const saved = {
  asset_id: "prepared",
  version_id: "prepared-version",
  sha256: "b".repeat(64),
  record: 0,
  conformer: 0,
};
const prepared: StructurePrepareResult = {
  operation: "structure_prepare",
  source,
  options: preparationDefaults,
  artifact: "prepared.pdb",
  sha256: saved.sha256,
  reference: saved,
  inspection: {
    model_count: 1,
    selected_chains: ["A", "C"],
    parser_warnings: [],
    parser_warnings_truncated: false,
  },
  atom_count: 928,
  removed_residues: [],
  resolved_alternates: [],
};

it("opens the pocket task with the prepared version and returns without submitting", async () => {
  const user = userEvent.setup();
  const created = vi.fn();
  render(
    <StructurePrepareResults
      job={job}
      result={prepared}
      language="en"
      onCreated={created}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Find pockets with this structure" }),
  );
  expect(screen.getByText("p2rank.detect")).toBeVisible();
  expect(screen.getByLabelText("Pocket input")).toHaveTextContent(
    JSON.stringify(saved),
  );
  await user.click(screen.getByRole("button", { name: "← Back to results" }));
  expect(screen.getByText("Saved native structure")).toBeVisible();
  expect(created).not.toHaveBeenCalled();
});

it("keeps an exact downloadable mmCIF and its recorded metadata without offering an unsupported handoff", () => {
  render(
    <StructurePrepareResults
      job={job}
      language="zh"
      onCreated={vi.fn()}
      result={{
        ...prepared,
        artifact: "prepared.cif",
        options: { ...prepared.options, format: "cif" },
      }}
    />,
  );
  expect(screen.getByText("mmCIF")).toBeVisible();
  expect(screen.getByText("928")).toBeVisible();
  expect(screen.getByText("选用的原始链")).toBeVisible();
  expect(screen.getByText("A, C")).toBeVisible();
  expect(screen.getByRole("link", { name: "下载结构" })).toHaveAttribute(
    "href",
    artifactUrl(job.id, "prepared.cif"),
  );
  expect(
    screen.queryByRole("button", { name: "用此结构寻找口袋" }),
  ).not.toBeInTheDocument();
});
