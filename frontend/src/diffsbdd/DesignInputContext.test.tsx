import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { DesignInputContext } from "./DesignInputContext";

vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <output data-testid="source-3d">{urls.join("|")}</output>
  ),
}));
vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: ({
    source,
  }: {
    source: { url: string; record: number };
  }) => (
    <output data-testid="source-2d">
      {source.url}:{source.record}
    </output>
  ),
}));
afterEach(cleanup);
const molecule = {
    asset_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sha256: "a".repeat(64),
    record: 2,
    conformer: 0,
    version_id: null,
  },
  protein = {
    ...molecule,
    asset_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    record: 0,
  };
const job: Job = {
  id: "input-context",
  status: "succeeded",
  created_at: "2026-10-08T00:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
  request: {
    operation: "diffsbdd",
    name: "Input context",
    payload: { mode: "inpaint", molecule, protein },
  },
};

it("shows exact input records and keeps independently provided coordinate frames separate", async () => {
  render(<DesignInputContext job={job} language="en" />);
  expect(screen.getByTestId("source-2d")).toHaveTextContent(
    `/api/assets/${molecule.asset_id}:2`,
  );
  expect(screen.queryByTestId("source-3d")).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("tab", { name: "Input receptor" }));
  expect(screen.getByTestId("source-3d")).toHaveTextContent(
    `/api/assets/${protein.asset_id}`,
  );
  expect(screen.getByTestId("source-3d")).not.toHaveTextContent(
    molecule.asset_id,
  );
});

it("does not invent a source preview from missing or ambiguous references", () => {
  const { container } = render(
    <DesignInputContext
      language="en"
      job={
        {
          ...job,
          request: {
            ...job.request,
            payload: {
              mode: "inpaint",
              molecule: { ...molecule, conformer: 3 },
              protein: "unknown-input.pdb",
            },
          },
        } as Job
      }
    />,
  );
  expect(container).toBeEmptyDOMElement();
});
