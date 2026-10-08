import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { IndexedLibraryResults } from "./IndexedLibraryResults";
import * as transport from "../api";

vi.mock("./ResearchTable", () => ({
  ResearchTable: ({ onSelect }: { onSelect(row: unknown): void }) => (
    <button onClick={() => onSelect({ id: "record-1" })}>
      Select native record
    </button>
  ),
}));
vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: ({ urls }: { urls: string[] }) => (
    <div>Native preview: {urls[0]}</div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const job = "12345678-1234-1234-1234-123456789abc";
const sha = "a".repeat(64),
  report = "b".repeat(64);
const nativeUrl = `/api/datasets/${job}/members/structure?member_id=record-1&report_sha256=${report}`;
const detail = {
  id: "record-1",
  label: "BRD4 series member",
  supplier: "custom",
  geometry: "unbound_conformer",
  sha256: sha,
  report_sha256: report,
  url: nativeUrl,
};

it("inspects the exact native conformer and only saves when explicitly chosen", async () => {
  vi.spyOn(transport, "request").mockResolvedValue(detail);
  const asset = "23456789-2345-2345-2345-234567890abc",
    version = "34567890-3456-3456-3456-345678901abc";
  const save = vi.spyOn(transport.api, "post").mockResolvedValue({
    id: version,
    kind: "molecule",
    source_job: job,
    reference: {
      asset_id: asset,
      version_id: version,
      record: 0,
      conformer: 0,
      sha256: sha,
    },
  });
  render(<IndexedLibraryResults jobId={job} language="en" />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Select native record" }));
  expect(
    await screen.findByRole("heading", { name: detail.label }),
  ).toBeVisible();
  expect(screen.getByText("Research library")).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Original conformer MOL" }),
  ).toHaveAttribute("href", nativeUrl);
  expect(save).not.toHaveBeenCalled();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Save to historical files" }));
  expect(await screen.findByText("Saved to historical files")).toBeVisible();
  expect(save).toHaveBeenCalledWith(`/datasets/${job}/members/preserve`, {
    member_id: "record-1",
    report_sha256: report,
  });
  expect(
    screen.getByText(`Native preview: /api/assets/${asset}`),
  ).toBeVisible();
});

it("refuses a record URL with a mismatched native report instead of opening another source", async () => {
  vi.spyOn(transport, "request").mockResolvedValue({
    ...detail,
    url: nativeUrl.replace(report, "c".repeat(64)),
  });
  render(<IndexedLibraryResults jobId={job} language="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Select native record" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be loaded",
  );
  expect(screen.queryByText(/Native preview/)).toBeNull();
});
