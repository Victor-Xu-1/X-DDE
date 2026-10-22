import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import {
  BoundPropertyModelEvidence,
  PropertyModelEvidence,
} from "./PropertyModelEvidence";
import { ScientificReview } from "./ScientificReview";
import { ScientificResults } from "./ScientificResults";
import type { Job } from "../types";
import type { NativeResult, PropertyModel, ScientificPayload } from "./types";

vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: () => <div>Controlled molecular preview</div>,
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: () => <div>Controlled molecular thumbnail</div>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const model: PropertyModel = {
  job_id: "selected-model",
  name: "STAT6 SPR research model",
  activity_property: "pKd",
  activity_unit: "pKd",
  sha256: "a".repeat(64),
  source_report_sha256: "b".repeat(64),
  validation_records: 16,
  validation_metrics: [
    {
      name: "Test RMSE",
      value: 0.9588102921,
      unit: "pKd",
      method: "Held-out display fixture",
      meaning: "validation",
    },
    {
      name: "Test R²",
      value: -0.1937478415,
      unit: "dimensionless",
      method: "Held-out display fixture",
      meaning: "validation",
    },
  ],
};
const payload: ScientificPayload = {
  kind: "chemprop",
  mode: "predict",
  model_job: model.job_id,
  model_sha256: model.sha256,
  activity_property: model.activity_property,
  activity_unit: model.activity_unit,
};

it.each(["en", "zh"] as const)(
  "retains the selected model's weak evidence and source link in %s",
  (language) => {
    render(<PropertyModelEvidence model={model} language={language} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      language === "zh" ? "测试表现不足" : "Insufficient held-out performance",
    );
    expect(screen.getByText("-0.1937")).toBeVisible();
    expect(screen.getByText("0.9588 pKd")).toBeVisible();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "#task=selected-model",
    );
    expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
    expect(screen.queryByText(model.sha256)).toBeNull();
  },
);

it("keeps missing model evaluation unassessed, without made-up zero errors", () => {
  render(
    <PropertyModelEvidence
      model={{ ...model, validation_metrics: [], validation_records: 0 }}
      language="en"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "No verifiable held-out metrics",
  );
  expect(screen.queryByText("0.000")).toBeNull();
});

it("ignores a late response after selecting another model", async () => {
  let oldReply!: (value: PropertyModel) => void;
  const newer = {
    ...model,
    job_id: "newer-model",
    name: "Another assay model",
    sha256: "c".repeat(64),
  };
  vi.spyOn(client, "request").mockImplementation((path) =>
    path.endsWith("selected-model")
      ? new Promise((resolve) => {
          oldReply = resolve as (value: PropertyModel) => void;
        })
      : Promise.resolve(newer),
  );
  const view = render(
    <BoundPropertyModelEvidence payload={payload} language="en" />,
  );
  view.rerender(
    <BoundPropertyModelEvidence
      payload={{
        ...payload,
        model_job: newer.job_id,
        model_sha256: newer.sha256,
      }}
      language="en"
    />,
  );
  expect(await screen.findByText(newer.name)).toBeVisible();
  await act(async () => oldReply(model));
  expect(screen.queryByText(model.name)).toBeNull();
  expect(screen.getByText(newer.name)).toBeVisible();
});

it.each(["model_sha256", "activity_property", "activity_unit"] as const)(
  "refuses evidence for a changed %s",
  async (field) => {
    vi.spyOn(client, "request").mockResolvedValue(model);
    render(
      <BoundPropertyModelEvidence
        payload={{ ...payload, [field]: "another version or endpoint" }}
        language="en"
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be verified",
    );
    expect(screen.queryByText(model.name)).toBeNull();
    expect(screen.queryByText("-0.1937")).toBeNull();
  },
);

it("clears the previous version immediately when the checksum changes", async () => {
  let finish!: (value: PropertyModel) => void;
  vi.spyOn(client, "request")
    .mockResolvedValueOnce(model)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve as (value: PropertyModel) => void;
        }),
    );
  const view = render(
    <BoundPropertyModelEvidence payload={payload} language="en" />,
  );
  expect(await screen.findByText(model.name)).toBeVisible();
  view.rerender(
    <BoundPropertyModelEvidence
      payload={{ ...payload, model_sha256: "d".repeat(64) }}
      language="en"
    />,
  );
  expect(screen.queryByText(model.name)).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Checking model training evidence",
  );
  await act(async () => finish(model));
  expect(screen.getByRole("alert")).toHaveTextContent("could not be verified");
});

it("recovers only after an explicit retry and never exposes internal errors", async () => {
  const call = vi
    .spyOn(client, "request")
    .mockRejectedValueOnce(new Error("/opt/internal/model-store failed"))
    .mockResolvedValueOnce(model);
  render(<BoundPropertyModelEvidence payload={payload} language="en" />);
  expect(await screen.findByRole("alert")).not.toHaveTextContent(
    "/opt/internal",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText(model.name)).toBeVisible();
  expect(call).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps the exact model evaluation in the final submission review", async () => {
  vi.spyOn(client, "request").mockResolvedValue(model);
  render(
    <ScientificReview
      program="chemprop"
      payload={payload}
      language="en"
      inputs={[]}
      options={{ device: "cpu", cpu: 1, memory_mib: 2048, seed: 2026 }}
    />,
  );
  expect(await screen.findByText(model.name)).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Insufficient held-out performance",
  );
});

it("binds prediction-result evidence to the model recorded in that task", async () => {
  const read = vi.spyOn(client, "request").mockResolvedValue(model);
  const job = {
    id: "controlled-prediction",
    request: { operation: "chemprop_predict", payload },
  } as Job;
  const result: NativeResult = {
    operation: "chemprop_predict",
    program: "chemprop",
    version: "Display fixture; no inference",
    candidates: [
      {
        id: "source-record-001",
        smiles: "O=C(CCN1C=CN=N1)N1CCC=C(c2cc3cc(C(=O)N(C)C)[nH]c3cc2F)C1",
        geometry: "none",
        metrics: [],
      },
    ],
    interactions: [],
    validation_points: [],
    metrics: [],
    artifact_sha256: {},
  };
  render(<ScientificResults job={job} result={result} language="en" />);
  expect(await screen.findByText(model.name)).toBeVisible();
  expect(read).toHaveBeenCalledWith(
    `/scientific/property-models/${model.job_id}`,
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "Insufficient held-out performance",
  );
});
