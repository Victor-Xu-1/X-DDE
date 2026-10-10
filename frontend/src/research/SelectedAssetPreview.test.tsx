import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ScientificObject } from "./types";
import { SelectedAssetPreview } from "./SelectedAssetPreview";

vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: (props: unknown) => (
    <div data-testid="molecule" data-input={JSON.stringify(props)} />
  ),
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: unknown) => (
    <div data-testid="protein" data-input={JSON.stringify(props)} />
  ),
}));
vi.mock("./SequenceFilePreview", () => ({
  SequenceFilePreview: (props: unknown) => (
    <div data-testid="sequence" data-input={JSON.stringify(props)} />
  ),
}));
const molecule = {
  id: "record-two",
  kind: "molecule",
  label: "STAT6 series",
  reference: {
    asset_id: "series-file",
    record: 1,
    conformer: 0,
    sha256: "a".repeat(64),
  },
} as ScientificObject;

it("previews the exact selected record and clears its view when the asset changes", () => {
  const { rerender } = render(
    <SelectedAssetPreview object={molecule} language="en" />,
  );
  const input = () =>
    JSON.parse(screen.getByTestId("molecule").getAttribute("data-input")!);
  expect(input()).toMatchObject({
    source: { url: "/api/assets/series-file", record: 1 },
    records: [1],
  });
  expect(screen.getByText("Record 2")).toBeVisible();
  rerender(
    <SelectedAssetPreview
      object={{
        ...molecule,
        id: "other",
        reference: { ...molecule.reference, asset_id: "protac", record: 0 },
      }}
      language="zh"
    />,
  );
  expect(input()).toMatchObject({
    source: { url: "/api/assets/protac", record: 0 },
    records: [0],
  });
  expect(screen.getByText("记录 1")).toBeVisible();
  expect(screen.queryByText("Record 2")).toBeNull();
});

it("does not substitute conformer zero for another selected conformer", () => {
  render(
    <SelectedAssetPreview
      object={{
        ...molecule,
        reference: { ...molecule.reference, conformer: 2 },
      }}
      language="en"
    />,
  );
  const input = JSON.parse(
    screen.getByTestId("molecule").getAttribute("data-input")!,
  );
  expect(input.urls).toBeUndefined();
  expect(input.source.record).toBe(1);
});

it("places protein and pocket previews in the same selected-file inspector", () => {
  const { rerender } = render(
    <SelectedAssetPreview
      object={{ ...molecule, kind: "structure" }}
      language="en"
    />,
  );
  expect(
    JSON.parse(screen.getByTestId("protein").getAttribute("data-input")!),
  ).toMatchObject({ urls: ["/api/assets/series-file"], comparison: false });
  rerender(
    <SelectedAssetPreview
      object={{ ...molecule, kind: "sequence" }}
      language="en"
    />,
  );
  expect(screen.queryByTestId("protein")).toBeNull();
  expect(screen.queryByTestId("molecule")).toBeNull();
  expect(
    JSON.parse(screen.getByTestId("sequence").getAttribute("data-input")!),
  ).toMatchObject({ reference: molecule.reference });
});
