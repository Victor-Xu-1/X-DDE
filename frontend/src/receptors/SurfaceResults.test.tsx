import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { SurfaceResult } from "./surface-types";
import { surfaceDefaults } from "./surface-types";
import { SurfaceResults } from "./SurfaceResults";

const viewer = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: Record<string, unknown>) => {
    viewer.props = props;
    return <div data-testid="native-structure" />;
  },
}));
const source = {
  asset_id: "source",
  sha256: "0".repeat(64),
  record: 0,
  conformer: 0,
};
const row = {
  chain: "A",
  number: 614,
  insertion_code: "",
  resname: "ASN",
  isolated_area: 260,
  assembly_area: 42,
  buried_area: 218,
};
const result: SurfaceResult = {
  operation: "surface_exposure",
  source,
  regions: [row],
  options: surfaceDefaults,
  residues: [{ ...row, atom_count: 8 }],
  atoms: [{ ...row, atom: "OD1", element: "O" }],
  isolated_area: 260,
  assembly_area: 42,
  buried_area: 218,
  preview_artifact: "context.cif",
  artifacts: {},
};
const job: Job = {
  id: "native-task",
  request: {
    operation: "surface_exposure",
    name: "Protocol fixture",
    structure: source,
    regions: [row],
    options: surfaceDefaults,
  },
  status: "succeeded",
  created_at: "now",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
};

it.each(["en", "zh"] as const)(
  "locates the measured region, independent of incidental ligands (%s)",
  (language) => {
    render(<SurfaceResults job={job} result={result} language={language} />);
    expect(viewer.props).toMatchObject({
      urls: ["/api/jobs/native-task/download?name=context.cif"],
      initialMode: "cartoon",
      ligandContext: false,
      residueRegion: [
        {
          model: 0,
          chain: "A",
          number: 614,
          insertion_code: "",
          alternate_location: "",
        },
      ],
    });
    fireEvent.click(
      screen.getByRole("tab", {
        name: language === "zh" ? "按区域" : "By region",
      }),
    );
    fireEvent.click(screen.getByRole("row", { name: /A:ASN 614/ }));
    expect(viewer.props.focusResidue).toMatchObject({
      residue: "A:ASN:614:",
      nonce: 1,
    });
    expect(
      screen.getByRole("link", {
        name:
          language === "zh" ? "下载分析结构" : "Download analyzed structure",
      }),
    ).toHaveAttribute(
      "href",
      "/api/jobs/native-task/download?name=context.cif",
    );
  },
);
