import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import {
  ReferenceImportResults,
  type ReferenceImportResult,
} from "./ReferenceImportResults";

const { structure, drawing } = vi.hoisted(() => ({
  structure: vi.fn(),
  drawing: vi.fn(),
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: Record<string, unknown>) => {
    structure(props);
    return <div data-testid="structure-preview" />;
  },
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: (props: Record<string, unknown>) => {
    drawing(props);
    return <div data-testid="molecule-preview" />;
  },
}));
afterEach(() => {
  cleanup();
  structure.mockClear();
  drawing.mockClear();
});
const digest = "a".repeat(64);
const job = { id: "source-job" } as Job;
const result: ReferenceImportResult = {
  operation: "reference_import",
  source: "pdb",
  identifier: "9BIG",
  artifact: "9BIG.cif",
  sha256: digest,
  kind: "structure",
  request: { format: "cif" },
  reference: {
    asset_id: "asset",
    sha256: digest,
    record: 0,
    conformer: 0,
    version_id: "version",
  },
};

it.each(["en", "zh"] as const)(
  "binds original coordinates to their recorded source in %s",
  (language) => {
    render(
      <ReferenceImportResults job={job} result={result} language={language} />,
    );
    expect(structure.mock.lastCall?.[0]).toMatchObject({
      sourceSnapshot: true,
      expectedStructureSha256: digest,
      urls: ["/api/jobs/source-job/download?name=9BIG.cif"],
    });
    expect(drawing).not.toHaveBeenCalled();
    expect(screen.queryByText(/provenance\/digest/)).not.toBeInTheDocument();
  },
);

it.each(["en", "zh"] as const)(
  "shows an original molecule in verified 2D without a 3D request in %s",
  (language) => {
    render(
      <ReferenceImportResults
        job={job}
        result={{
          ...result,
          source: "chembl",
          kind: "molecule",
          artifact: "CHEMBL376085.sdf",
          identifier: "CHEMBL376085",
          request: { format: "sdf" },
        }}
        language={language}
      />,
    );
    expect(structure).not.toHaveBeenCalled();
    expect(drawing.mock.lastCall?.[0]).toMatchObject({
      source: {
        url: "/api/jobs/source-job/download?name=CHEMBL376085.sdf",
        record: 0,
        sha256: digest,
      },
    });
  },
);

it("permits explicit preparation only after verification and rejects late readiness for another source", () => {
  const page = render(
    <ReferenceImportResults
      job={job}
      result={result}
      language="en"
      onCreated={vi.fn()}
    />,
  );
  const action = () =>
    screen.getByRole("button", { name: "Prepare research structure" });
  expect(action()).toBeDisabled();
  const verifyOld = structure.mock.lastCall![0].onStructureVerification as (
    ready: boolean,
  ) => void;
  act(() => verifyOld(true));
  expect(action()).toBeEnabled();
  page.rerender(
    <ReferenceImportResults
      job={job}
      result={{ ...result, sha256: "b".repeat(64) }}
      language="en"
      onCreated={vi.fn()}
    />,
  );
  expect(action()).toBeDisabled();
  act(() => verifyOld(true));
  expect(action()).toBeDisabled();
  const verifyCurrent = structure.mock.lastCall![0].onStructureVerification as (
    ready: boolean,
  ) => void;
  act(() => verifyCurrent(true));
  expect(action()).toBeDisabled(); // Registered asset still points at the previous source.
});

it("does not let a late source verification replace the current verified source", () => {
  const page = render(
    <ReferenceImportResults
      job={job}
      result={result}
      language="en"
      onCreated={vi.fn()}
    />,
  );
  const old = structure.mock.lastCall![0].onStructureVerification as (
    ready: boolean,
  ) => void;
  const updated = {
    ...result,
    sha256: "b".repeat(64),
    reference: { ...result.reference!, sha256: "b".repeat(64) },
  };
  page.rerender(
    <ReferenceImportResults
      job={job}
      result={updated}
      language="en"
      onCreated={vi.fn()}
    />,
  );
  const current = structure.mock.lastCall![0].onStructureVerification as (
    ready: boolean,
  ) => void;
  act(() => current(true));
  expect(
    screen.getByRole("button", { name: "Prepare research structure" }),
  ).toBeEnabled();
  act(() => old(false));
  expect(
    screen.getByRole("button", { name: "Prepare research structure" }),
  ).toBeEnabled();
});

it("keeps a source download available without pretending a missing digest was verified", () => {
  render(
    <ReferenceImportResults
      job={job}
      result={{ ...result, sha256: "" }}
      language="en"
      onCreated={vi.fn()}
    />,
  );
  expect(structure).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Download source file" }),
  ).toHaveAttribute("href", "/api/jobs/source-job/download?name=9BIG.cif");
  expect(
    screen.getByRole("button", { name: "Prepare research structure" }),
  ).toBeDisabled();
});
