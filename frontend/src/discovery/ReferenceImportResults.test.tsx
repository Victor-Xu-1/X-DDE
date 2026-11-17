import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
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
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("Unavailable", { status: 503 })),
  );
});
afterEach(() => {
  cleanup();
  structure.mockClear();
  drawing.mockClear();
  vi.unstubAllGlobals();
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
  async (language) => {
    const { source, molecule } = await originalMolecule();
    vi.mocked(fetch).mockImplementation(async () => new Response(source));
    render(
      <ReferenceImportResults
        job={job}
        result={{
          ...molecule,
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
    await waitFor(() => expect(drawing).toHaveBeenCalled());
    expect(drawing.mock.lastCall?.[0]).toMatchObject({
      source: {
        url: "/api/jobs/source-job/download?name=CHEMBL376085.sdf",
        record: 0,
        sha256: molecule.sha256,
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

async function originalMolecule() {
  const source =
    "Reference\n  native\n\n  0  0  0  0  0  0            999 V2000\nM  END\n$$$$\n";
  const sha256 = Buffer.from(
    await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(source)),
  ).toString("hex");
  const molecule: ReferenceImportResult = {
    ...result,
    kind: "molecule",
    source: "chembl",
    identifier: "source-record",
    artifact: "reference.sdf",
    sha256,
    request: { format: "sdf" },
    reference: { ...result.reference!, sha256 },
  };
  return { source, molecule };
}

it.each(["en", "zh"] as const)(
  "permits verified molecule preparation independently of an unavailable drawing in %s",
  async (language) => {
    const { source, molecule } = await originalMolecule();
    vi.mocked(fetch).mockImplementation(async () => new Response(source));
    render(
      <ReferenceImportResults
        job={job}
        result={molecule}
        language={language}
        onCreated={vi.fn()}
      />,
    );
    const prepare = screen.getByRole("button", {
      name: language === "zh" ? "准备分子" : "Prepare molecule",
    });
    expect(prepare).toBeDisabled();
    await waitFor(() => expect(prepare).toBeEnabled());
    // The mock never reports drawing readiness; file identity is verified from real bytes.
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "/api/jobs/source-job/download?name=reference.sdf",
      { signal: expect.any(AbortSignal) },
    );
  },
);

it("keeps a mismatched source blocked until an explicit successful file retry", async () => {
  const { source, molecule } = await originalMolecule();
  vi.mocked(fetch)
    .mockImplementationOnce(async () => new Response(source + "changed"))
    .mockImplementationOnce(async () => new Response(source));
  render(
    <ReferenceImportResults
      job={job}
      result={molecule}
      language="en"
      onCreated={vi.fn()}
    />,
  );
  const prepare = screen.getByRole("button", {
    name: "Prepare molecule",
  });
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(prepare).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Retry source verification",
    }),
  );
  await waitFor(() => expect(prepare).toBeEnabled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("ignores a late failed byte verification from the previous archived job", async () => {
  const { source, molecule } = await originalMolecule();
  let finishOld!: (response: Response) => void;
  vi.mocked(fetch)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockImplementationOnce(async () => new Response(source));
  const page = render(
    <ReferenceImportResults
      job={job}
      result={molecule}
      language="en"
      onCreated={vi.fn()}
    />,
  );
  page.rerender(
    <ReferenceImportResults
      job={{ ...job, id: "next-job" }}
      result={molecule}
      language="en"
      onCreated={vi.fn()}
    />,
  );
  const prepare = screen.getByRole("button", {
    name: "Prepare molecule",
  });
  await waitFor(() => expect(prepare).toBeEnabled());
  await act(async () => finishOld(new Response(source + "changed")));
  expect(prepare).toBeEnabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
