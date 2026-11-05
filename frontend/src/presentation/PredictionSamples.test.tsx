import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PredictionSamples, type PredictionSample } from "./PredictionSamples";

const save = vi.hoisted(() => vi.fn());
vi.mock("./visual-export", () => ({ downloadBlob: save }));

afterEach(() => {
  save.mockReset();
  vi.unstubAllGlobals();
});

const rows: PredictionSample[] = [
  {
    id: "seed-101-rank-0",
    seed: 101,
    sample: 0,
    artifact: "first.cif",
    metrics: [{ name: "pTM", value: 0.56, unit: "0–1" }],
  },
  {
    id: "seed-101-rank-1",
    seed: 101,
    sample: 1,
    artifact: "second.cif",
    metrics: [{ name: "pTM", value: 0.81, unit: "0–1" }],
  },
  {
    id: "seed-202-rank-0",
    seed: 202,
    sample: 0,
    artifact: "other.cif",
    metrics: [{ name: "pTM", value: null, unit: "0–1" }],
  },
];

it("keeps native sample, score and download identity together across seeds and refresh", async () => {
  const fetcher = vi.fn();
  // A distinct response is required per download, as in the browser.
  fetcher.mockImplementation(
    async () =>
      new Response("ZIP", { headers: { "Content-Type": "application/zip" } }),
  );
  vi.stubGlobal("fetch", fetcher);

  const onSelect = vi.fn();
  const p = {
    job: "retained",
    rows,
    selected: rows[0].id,
    onSelect,
    language: "en" as const,
  };
  const view = render(<PredictionSamples {...p} />);
  expect(
    screen.getByRole("button", { name: "Previous sample" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /This model/ }));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "application/zip" }),
      "retained-seed-101-rank-0.zip",
    ),
  );
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/jobs/retained/prediction-sample.zip?candidate=seed-101-rank-0",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sample 1" }));
  expect(onSelect).toHaveBeenLastCalledWith(rows[1].id);
  view.rerender(<PredictionSamples {...p} selected={rows[1].id} />);
  fireEvent.click(screen.getByRole("button", { name: /This model/ }));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "application/zip" }),
      "retained-seed-101-rank-1.zip",
    ),
  );
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/jobs/retained/prediction-sample.zip?candidate=seed-101-rank-1",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(
    screen.getByLabelText("Selected sample native metrics"),
  ).toHaveTextContent("0.81");
  fireEvent.change(screen.getByRole("combobox", { name: "Select seed" }), {
    target: { value: "202" },
  });
  expect(onSelect).toHaveBeenLastCalledWith(rows[2].id);
  view.rerender(
    <PredictionSamples {...p} job="second-job" selected={rows[2].id} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /This model/ }));
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "application/zip" }),
      "second-job-seed-202-rank-0.zip",
    ),
  );
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/jobs/second-job/prediction-sample.zip?candidate=seed-202-rank-0",
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(
    screen.getByLabelText("Selected sample native metrics"),
  ).toHaveTextContent("—");
  expect(screen.getByRole("button", { name: "Next sample" })).toBeDisabled();
});

it("preserves native identifiers when a backend supplies no sample or seed mapping", () => {
  render(
    <PredictionSamples
      job="native"
      rows={[{ ...rows[0], id: "structure-017", seed: null, sample: null }]}
      selected="structure-017"
      onSelect={vi.fn()}
      language="zh"
    />,
  );
  expect(
    screen.getByRole("button", { name: "构象 structure-017" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    within(screen.getByRole("combobox", { name: "选择随机种子" })).getByRole(
      "option",
    ),
  ).toHaveTextContent("未记录");
});

it("does not substitute another result for an unavailable selected sample", () => {
  render(
    <PredictionSamples
      job="native"
      rows={rows}
      selected="missing"
      onSelect={vi.fn()}
      language="en"
    />,
  );
  expect(screen.queryByRole("button", { name: /This model/ })).toBeNull();
});

it("uses native ranking within each seed and leaves the selected sample in control", () => {
  const ranked = rows.map((row, i) => ({
    ...row,
    metrics: [{ name: "Ranking score", value: [0.4, 0.82, 0.99][i], unit: "" }],
  }));
  const onSelect = vi.fn();
  render(
    <PredictionSamples
      job="native"
      rows={ranked}
      selected={ranked[0].id}
      language="en"
      onSelect={onSelect}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Highest ranking · 1" }));
  expect(onSelect).toHaveBeenLastCalledWith(ranked[1].id);
  expect(screen.getByRole("button", { name: "Sample 0" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("option", { name: "101 · 0.82" })).toHaveProperty(
    "selected",
    true,
  );
  expect(
    screen.getByRole("option", { name: "202 · 0.99" }),
  ).toBeInTheDocument();
});

it("offers the selected original CIF only for unsealed legacy results", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ detail: { code: "legacy_unsealed_structure" } }),
          { status: 409 },
        ),
      ),
  );
  render(
    <PredictionSamples
      job="native"
      rows={rows}
      selected={rows[1].id}
      language="en"
      onSelect={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /This model/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The sample package is unavailable.",
  );
  expect(
    screen.getByRole("link", { name: "Download original CIF" }),
  ).toHaveAttribute("href", "/api/jobs/native/download?name=second.cif");
  expect(save).not.toHaveBeenCalled();
});

it("cancels a download before an old response body can save after selecting another sample", async () => {
  let release: (blob: Blob) => void = () => {
    throw new Error("Body was not read");
  };
  const blob = vi.fn(
    () =>
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
  );
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({ "Content-Type": "application/zip" }),
    blob,
  });
  vi.stubGlobal("fetch", fetcher);
  const p = {
    job: "retained",
    rows,
    selected: rows[0].id,
    onSelect: vi.fn(),
    language: "en" as const,
  };
  const view = render(<PredictionSamples {...p} />);
  fireEvent.click(screen.getByRole("button", { name: /This model/ }));
  await waitFor(() => expect(blob).toHaveBeenCalledOnce());
  view.rerender(<PredictionSamples {...p} selected={rows[1].id} />);
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () =>
    release(new Blob(["ZIP"], { type: "application/zip" })),
  );
  expect(save).not.toHaveBeenCalled();
});

it("does not offer an unverified CIF after a source checksum failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("invalid", { status: 422 })),
  );
  render(
    <PredictionSamples
      job="native"
      rows={rows}
      selected={rows[1].id}
      language="en"
      onSelect={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /This model/ }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Download original CIF" }),
  ).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
