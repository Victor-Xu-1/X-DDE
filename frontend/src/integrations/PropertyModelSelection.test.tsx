import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { PropertyModelSelection } from "./PropertyModelSelection";
import type { PropertyModel } from "./types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const model: PropertyModel = {
  job_id: "egfr-model",
  name: "EGFR assay model",
  activity_property: "pIC50",
  activity_unit: "pIC50",
  sha256: "a".repeat(64),
};
const props = {
  language: "en" as const,
  payload: { kind: "chemprop" as const, mode: "predict" },
  onChange: vi.fn(),
};

it("distinguishes a pending model request from a missing training prerequisite", async () => {
  let finish!: (value: { models: PropertyModel[] }) => void;
  vi.spyOn(client, "request").mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const train = vi.fn();
  render(<PropertyModelSelection {...props} onTrainModel={train} />);
  expect(screen.getByText("Loading research models…")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Train a property model" }),
  ).toBeNull();
  await act(async () => finish({ models: [] }));
  await userEvent
    .setup()
    .click(
      await screen.findByRole("button", { name: "Train a property model" }),
    );
  expect(train).toHaveBeenCalledOnce();
});

it("binds the selected native model checksum, endpoint and unit together", async () => {
  vi.spyOn(client, "request").mockResolvedValue({ models: [model] });
  const update = vi.fn();
  render(<PropertyModelSelection {...props} onChange={update} />);
  await screen.findByRole("option", {
    name: "EGFR assay model · pIC50 (pIC50)",
  });
  await userEvent
    .setup()
    .selectOptions(screen.getByRole("combobox"), "egfr-model");
  expect(update).toHaveBeenCalledExactlyOnceWith({
    model_job: model.job_id,
    model_sha256: model.sha256,
    activity_property: "pIC50",
    activity_unit: "pIC50",
  });
});

it("reports a retrieval failure without inventing an empty model list", async () => {
  vi.spyOn(client, "request").mockRejectedValue(
    new Error("/opt/internal/model-store: permission denied"),
  );
  render(<PropertyModelSelection {...props} onTrainModel={vi.fn()} />);
  expect(await screen.findByRole("alert")).not.toHaveTextContent(
    "/opt/internal",
  );
  expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Train a property model" }),
  ).toBeNull();
});
