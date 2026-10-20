import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ResearchTable } from "./ResearchTable";
import * as transport from "../api";
import userEvent from "@testing-library/user-event";

vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ label }: { label: string }) => (
    <div role="img" aria-label={label} />
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  ["en", "Literature binding report"],
  ["zh", "文献结合报告"],
] as const)(
  "shows a qualitative observation once with a readable endpoint in %s",
  async (language, label) => {
    const observation = "Reported binding; exact KD was not supplied";
    vi.spyOn(transport, "request").mockResolvedValue({
      rows: [
        {
          member: "A035-B040-C030",
          endpoint: "reported_binding",
          unit: "qualitative",
          value: null,
          qualifier: observation,
          matched: 1,
        },
      ],
      total: 1,
      offset: 0,
      has_more: false,
    });
    render(
      <ResearchTable jobId="followup" view="followup" language={language} />,
    );
    expect(await screen.findByText(label)).toBeVisible();
    expect(screen.getAllByText(observation)).toHaveLength(1);
    expect(screen.queryByText("reported_binding")).toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
  },
);

it("preserves zero, censored numeric precision and additional reported observations", async () => {
  vi.spyOn(transport, "request").mockResolvedValue({
    rows: [
      {
        member: "measured-zero",
        endpoint: "inhibition",
        unit: "percent",
        value: 0,
        qualifier: "",
        relation: "=",
        matched: 1,
      },
      {
        member: "reported-limit",
        endpoint: "KD",
        unit: "nM",
        value: 5.123456789,
        qualifier: "Original assay annotation",
        relation: "<",
        matched: 0,
      },
    ],
    total: 2,
    offset: 0,
    has_more: false,
  });
  render(<ResearchTable jobId="followup" view="followup" language="en" />);
  expect(await screen.findByRole("cell", { name: "0" })).toBeVisible();
  expect(
    screen.getByRole("cell", {
      name: "<5.123456789 · Original assay annotation",
    }),
  ).toBeVisible();
});

it("labels selection with the public name while retaining the exact internal identity", async () => {
  vi.spyOn(transport, "request").mockResolvedValue({
    rows: [
      { id: "cmp-exact", display_name: "CHEMBL487451", smiles: "c1ccccc1" },
    ],
    total: 1,
    offset: 0,
    has_more: false,
  });
  const select = vi.fn();
  render(
    <ResearchTable
      jobId="study"
      view="library"
      language="en"
      onSelection={select}
    />,
  );
  await userEvent
    .setup()
    .click(
      await screen.findByRole("checkbox", { name: "Select CHEMBL487451" }),
    );
  expect(select).toHaveBeenCalledWith(["cmp-exact"]);
});
it("uses supplied medicinal-chemistry names and human sources without dead identifier buttons", async () => {
  vi.spyOn(transport, "request").mockResolvedValue({
    rows: [
      {
        id: "opaque-record",
        display_name: "DEL006-A035-B040-C030",
        smiles: "c1ccccc1",
        supplier: "custom",
      },
    ],
    total: 1,
    offset: 0,
    has_more: false,
  });
  render(<ResearchTable jobId="study" view="index" language="zh" />);
  expect(
    await screen.findByRole("img", { name: "DEL006-A035-B040-C030" }),
  ).toBeVisible();
  expect(screen.getByText("研究库")).toBeVisible();
  expect(screen.queryByText("custom")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "DEL006-A035-B040-C030" }),
  ).toBeNull();
});

it("retains truncated and historical UMI observations in a searchable native table", async () => {
  const transportCall = vi.spyOn(transport, "request").mockResolvedValue({
    rows: [
      {
        member: "DEL006-A071-B015-C004",
        sample: "public",
        umi: "ACAG",
        reads: 1,
        observed_length: 4,
        expected_length: 11,
        umi_status: "truncated",
      },
      {
        member: "legacy",
        sample: "public",
        umi: "ACGT",
        reads: 1,
        observed_length: 4,
        expected_length: null,
        umi_status: null,
      },
    ],
    total: 2,
    offset: 0,
    has_more: false,
  });
  render(<ResearchTable jobId="decoded-job" view="decoded" language="en" />);
  expect(await screen.findByText("Truncated")).toBeVisible();
  expect(screen.getByText("Not assessed")).toBeVisible();
  expect(screen.getByText("ACAG")).toBeVisible();
  expect(transportCall.mock.calls[0][0]).toContain(
    "/datasets/decoded-job/table?",
  );
  expect(transportCall.mock.calls[0][0]).toContain("view=decoded");
  await userEvent.setup().type(screen.getByRole("searchbox"), "A071");
  expect(transportCall.mock.calls.at(-1)![0]).toContain("search=A071");
});

it("does not present old comparison rows while a changed query is pending", async () => {
  let finish!: (value: unknown) => void;
  const call = vi
    .spyOn(transport, "request")
    .mockResolvedValueOnce({
      rows: [{ member: "first-comparison-only" }],
      total: 1,
      offset: 0,
      has_more: false,
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const { rerender } = render(
    <ResearchTable
      jobId="study"
      view="enrichment"
      comparison="e1"
      language="en"
    />,
  );
  expect(await screen.findByText("first-comparison-only")).toBeVisible();
  rerender(
    <ResearchTable
      jobId="study"
      view="enrichment"
      comparison="e2"
      language="en"
    />,
  );
  expect(screen.queryByText("first-comparison-only")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading selected results",
  );
  await act(async () =>
    finish({
      rows: [
        {
          member: "second-comparison-only",
          supporting_samples: 2,
          target_samples: 3,
        },
      ],
      total: 1,
      offset: 0,
      has_more: false,
    }),
  );
  expect(await screen.findByText("second-comparison-only")).toBeVisible();
  expect(
    screen.getByRole("columnheader", { name: "Supporting samples" }),
  ).toBeVisible();
  expect(call.mock.calls[1][0]).toContain("comparison=e2");
});

it("keeps old tables complete and opts new consistency analyses into the explicit filter", async () => {
  const call = vi
    .spyOn(transport, "request")
    .mockResolvedValue({ rows: [], total: 0, offset: 0, has_more: false });
  const { unmount } = render(
    <ResearchTable jobId="legacy" view="enrichment" language="en" />,
  );
  expect(
    await screen.findByText("No members match the current criteria"),
  ).toBeVisible();
  expect(call.mock.calls[0][0]).toContain("prioritized=false");
  expect(
    screen.queryByRole("columnheader", { name: "Supporting samples" }),
  ).toBeNull();
  unmount();
  render(
    <ResearchTable
      jobId="new"
      view="enrichment"
      language="en"
      defaultPrioritized
    />,
  );
  expect(screen.getByRole("checkbox")).toBeChecked();
  expect(call.mock.calls.at(-1)![0]).toContain("prioritized=true");
});
it("sends a literal block search and series type to the native table, retaining explicit row labels", async () => {
  const call = vi.spyOn(transport, "request").mockResolvedValue({
    rows: [{ kind: "mono", block_a: "B040", block_b: "", score: 2 }],
    total: 9402,
    offset: 0,
    has_more: false,
  });
  render(<ResearchTable jobId="series" view="series" language="en" />);
  expect(await screen.findByText("Monosynthon")).toBeVisible();
  const user = userEvent.setup();
  await user.type(
    screen.getByRole("searchbox", { name: "Search building blocks" }),
    "B040",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Series type" }),
    "mono",
  );
  expect(call.mock.calls.at(-1)![0]).toContain("search=B040");
  expect(call.mock.calls.at(-1)![0]).toContain("series_kind=mono");
  expect(call.mock.calls.at(-1)![0]).toContain("offset=0");
});
