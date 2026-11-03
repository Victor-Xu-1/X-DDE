import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PredictionSamples, type PredictionSample } from "./PredictionSamples";

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

it("keeps native sample, score and download identity together across seeds and refresh", () => {
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
  expect(screen.getByRole("link", { name: /This model/ })).toHaveAttribute(
    "href",
    "/api/jobs/retained/download?name=first.cif",
  );
  fireEvent.click(screen.getByRole("button", { name: "Sample 1" }));
  expect(onSelect).toHaveBeenLastCalledWith(rows[1].id);
  view.rerender(<PredictionSamples {...p} selected={rows[1].id} />);
  expect(screen.getByRole("link", { name: /This model/ })).toHaveAttribute(
    "href",
    "/api/jobs/retained/download?name=second.cif",
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
  expect(screen.getByRole("link", { name: /This model/ })).toHaveAttribute(
    "href",
    "/api/jobs/second-job/download?name=other.cif",
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
  expect(screen.getByRole("button", { name: "structure-017" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
  expect(screen.queryByRole("link")).toBeNull();
});
