import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { IndexedLibraryResults } from "./IndexedLibraryResults";
import * as transport from "../api";

vi.mock("./ResearchTable", () => ({
  ResearchTable: ({
    onSelect,
    view,
  }: {
    onSelect(row: unknown): void;
    view: string;
  }) => (
    <button onClick={() => onSelect({ id: "record-1" })}>
      Select native record {view}
    </button>
  ),
}));
vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: ({
    urls,
    source,
    sourceSnapshot,
    toolbar,
  }: {
    urls?: string[];
    source: { url: string; sha256?: string };
    sourceSnapshot?: boolean;
    toolbar?: ReactNode;
  }) => (
    <div
      data-testid="member-preview"
      data-snapshot={sourceSnapshot}
      data-sha256={source.sha256}
    >
      {toolbar}
      {urls?.length
        ? `Native preview: ${urls[0]}`
        : `Native 2D only: ${source.url}`}
    </div>
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
    .click(screen.getByRole("button", { name: "Select native record index" }));
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
  fireEvent.click(
    screen.getByRole("button", { name: "Select native record index" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be loaded",
  );
  expect(screen.queryByText(/Native preview/)).toBeNull();
});

it("keeps a screening index on the verified original before and after explicitly saving", async () => {
  vi.spyOn(transport, "request").mockResolvedValue(detail);
  const asset = "23456789-2345-2345-2345-234567890abc";
  const version = "34567890-3456-3456-3456-345678901abc";
  const preserve = vi.spyOn(transport.api, "post").mockResolvedValue({
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
  render(<IndexedLibraryResults jobId={job} language="en" screeningReview />);
  fireEvent.click(
    screen.getByRole("button", { name: "Select native record index" }),
  );
  const preview = await screen.findByTestId("member-preview");
  expect(preview).toHaveAttribute("data-snapshot", "true");
  expect(preview).toHaveAttribute("data-sha256", sha);
  expect(preview).toHaveTextContent(nativeUrl);
  const identity = screen.getByRole("heading", { name: detail.label }).parentElement;
  expect(identity).toHaveTextContent("Research library");
  expect(identity).toHaveTextContent("Unbound conformer");
  expect(screen.getByRole("link", { name: "Download MOL" })).toHaveAttribute("href", nativeUrl);
  await userEvent.setup().click(screen.getByRole("button", { name: "Source and conformer" }));
  expect(screen.getByRole("tooltip")).toHaveTextContent("Source Research library");
  expect(preserve).not.toHaveBeenCalled();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Save file" }));
  expect(await screen.findByText("Saved to historical files")).toBeVisible();
  expect(preserve).toHaveBeenCalledExactlyOnceWith(
    `/datasets/${job}/members/preserve`,
    { member_id: detail.id, report_sha256: detail.report_sha256 },
  );
  expect(screen.getByTestId("member-preview")).toBe(preview);
  expect(preview).toHaveTextContent(nativeUrl);
  expect(preview).toHaveAttribute("data-snapshot", "true");
});

it("inspects a prepared 2D library without pretending it is a calculated 3D conformer", async () => {
  vi.spyOn(transport, "request").mockResolvedValue({
    ...detail,
    geometry: "source_2d",
  });
  const save = vi.spyOn(transport.api, "post");
  render(
    <IndexedLibraryResults
      {...{ jobId: job, language: "en" as const, view: "library" as const }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Select native record library" }),
  );
  expect(
    await screen.findByRole("heading", { name: detail.label }),
  ).toBeVisible();
  expect(screen.getByText(`Native 2D only: ${nativeUrl}`)).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Original structure MOL" }),
  ).toHaveAttribute("href", nativeUrl);
  expect(screen.queryByText("Unbound conformer")).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
