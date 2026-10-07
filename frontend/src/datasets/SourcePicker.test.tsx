import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { SourcePicker } from "./SourcePicker";
import { DELPrerequisite } from "./DELPrerequisite";
import type { AvailableDataset } from "./types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const item: AvailableDataset = {
  job_id: "brd4-counts",
  report_sha256: "a".repeat(64),
  role: "counts",
  name: "BRD4 replicate counts",
  counts: { observed_members: 25 },
  metadata: {},
};
const props = {
  role: "counts" as const,
  language: "en" as const,
  label: "Study result",
  values: [],
  onChange: vi.fn(),
};

it("waits for the source list before offering its genuine prerequisite task", async () => {
  let finish!: (items: AvailableDataset[]) => void;
  vi.spyOn(client, "request").mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const prepare = vi.fn();
  render(
    <SourcePicker
      {...props}
      emptyAction={
        <DELPrerequisite role="counts" language="en" onPrepare={prepare} />
      }
    />,
  );
  expect(screen.getByText("Loading research results…")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Prepare UMI counts" }),
  ).toBeNull();
  await act(async () => finish([]));
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Prepare UMI counts" }));
  expect(prepare).toHaveBeenCalledExactlyOnceWith("del.count");
});

it("ignores a late response for a previously selected source role", async () => {
  let old!: (items: AvailableDataset[]) => void;
  const fetch = vi.spyOn(client, "request").mockImplementation((path) =>
    path.includes("role=counts")
      ? new Promise((resolve) => {
          old = resolve;
        })
      : Promise.resolve([
          {
            ...item,
            job_id: "definition",
            role: "definition",
            name: "Reviewed DEL library",
          },
        ]),
  );
  const { rerender } = render(<SourcePicker {...props} />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  rerender(<SourcePicker {...props} role="definition" />);
  expect(
    await screen.findByRole("button", { name: /Reviewed DEL library/ }),
  ).toBeVisible();
  await act(async () => old([item]));
  expect(
    screen.queryByRole("button", { name: /BRD4 replicate counts/ }),
  ).toBeNull();
});

it("keeps internal transport errors out of the page and allows an explicit retry", async () => {
  const fetch = vi
    .spyOn(client, "request")
    .mockRejectedValueOnce(
      new Error("/srv/private/cache/trace.json: internal failure"),
    )
    .mockResolvedValueOnce([]);
  render(<SourcePicker {...props} />);
  expect(await screen.findByRole("alert")).not.toHaveTextContent(
    "/srv/private",
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("preserves the source checksum and does not replace a missing count with zero", async () => {
  const update = vi.fn(),
    source = { ...item, counts: {} };
  vi.spyOn(client, "request").mockResolvedValue([source]);
  render(<SourcePicker {...props} onChange={update} />);
  const option = await screen.findByRole("button", {
    name: /BRD4 replicate counts/,
  });
  expect(option).toHaveTextContent("Completed research result");
  expect(option).not.toHaveTextContent("0 research records");
  await userEvent.setup().click(option);
  expect(update).toHaveBeenCalledExactlyOnceWith([source]);
});
it("shows an explicitly loaded template source that is absent from personal history", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  render(<SourcePicker {...props} values={[item]} />);
  const source = screen.getByRole("button", { name: /BRD4 replicate counts/ });
  expect(source).toHaveAttribute("aria-pressed", "true");
  await waitFor(() =>
    expect(screen.queryByText("Loading research results…")).toBeNull(),
  );
  expect(screen.queryByText(/No completed materials yet/)).toBeNull();
});
