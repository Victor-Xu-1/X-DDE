import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { PoseSession, usePoseSession } from "./PoseSession";
import { PoseStudyInput } from "./PoseStudyInput";
import { usePoseHandoff } from "./usePoseHandoff";
import { posePlan } from "./pose-plan";
import type { ScientificObject } from "../research/types";
import type { SavedPose } from "./pose-types";
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  request: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("../api", () => ({
  api: { post: mocks.post, cancel: mocks.cancel },
  request: mocks.request,
}));
const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const original: ScientificObject = {
  id: id(1),
  family_id: id(1),
  kind: "molecule",
  label: "STAT6 source record",
  reference: {
    asset_id: id(2),
    version_id: id(1),
    sha256: "a".repeat(64),
    record: 1,
    conformer: 0,
  },
  parent_id: null,
  relation: "derived_from",
  source_job: null,
  created_at: "2026-10-11",
  notes: "",
  rating: 0,
  validation: "file_integrity_only",
};
const saved: SavedPose = {
  job_id: id(10),
  pose: {
    ...original,
    id: id(11),
    source_job: id(10),
    parent_id: original.id,
    relation: "edited_from",
    label: "STAT6 saved optimized pose",
    validation: "native_edited",
    reference: {
      asset_id: id(12),
      version_id: id(11),
      sha256: "b".repeat(64),
      record: 0,
      conformer: 0,
    },
  },
  energy: {
    before: 20,
    after: 10,
    method: "MMFF94s",
    unit: "kcal/mol",
    converged: true,
  },
  receptor: null,
  native_score: null,
};
const frame = {
  urls: [`/api/assets/${original.reference.asset_id}`],
  records: [1],
  molecularSource: {
    url: `/api/assets/${original.reference.asset_id}`,
    record: 1,
  },
};
afterEach(() => {
  cleanup();
  mocks.post.mockReset();
  mocks.request.mockReset();
  mocks.cancel.mockReset();
});
function PreviewControls() {
  const pose = usePoseSession()!.controller;
  return (
    <>
      <output data-testid="displayed-file">{pose.downloadUrl}</output>
      <button onClick={() => void pose.minimize("MMFF94s", 1000)}>
        Minimize
      </button>
      <button onClick={pose.previous}>Undo</button>
      <button onClick={pose.next}>Redo</button>
    </>
  );
}
function ResearchFlow({
  scope = "one",
  input = original,
}: {
  scope?: string;
  input?: ScientificObject;
}) {
  const handoff = usePoseHandoff<"properties">(scope);
  const [view, setView] = useState("3d");
  if (handoff.value)
    return (
      <>
        <div data-testid="confirmed-input">
          {JSON.stringify(handoff.value.selection.reference)}
        </div>
        <button onClick={handoff.clear}>Back</button>
      </>
    );
  return (
    <>
      <button onClick={() => setView(view === "3d" ? "2d" : "3d")}>
        Toggle view
      </button>
      {view === "3d" && (
        <PoseSession frame={frame}>
          <PreviewControls />
        </PoseSession>
      )}
      <PoseStudyInput original={input} language="en">
        {(selection) => (
          <button
            disabled={!selection?.ready}
            onClick={() => {
              if (selection) handoff.open("properties", selection);
            }}
          >
            Continue
          </button>
        )}
      </PoseStudyInput>
    </>
  );
}
function nativeReplies() {
  mocks.post.mockImplementation(async (path: string) =>
    path.endsWith("/save") ? saved : { id: saved.job_id },
  );
  mocks.request.mockResolvedValue({ id: saved.job_id, status: "succeeded" });
}

it("keeps the actual saved pose through view switches, handoff, back, undo and redo with one controller", async () => {
  nativeReplies();
  const user = userEvent.setup();
  render(
    <PoseSession frame={frame}>
      <ResearchFlow />
    </PoseSession>,
  );
  await user.click(screen.getByRole("button", { name: "Minimize" }));
  await waitFor(() =>
    expect(screen.getByTestId("displayed-file")).toHaveTextContent(
      saved.pose.reference.asset_id,
    ),
  );
  expect(
    mocks.post.mock.calls.filter(([path]) => path.endsWith("/minimize")),
  ).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Toggle view" }));
  await user.click(screen.getByRole("button", { name: "Toggle view" }));
  expect(screen.getByTestId("displayed-file")).toHaveTextContent(
    saved.pose.reference.asset_id,
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByTestId("confirmed-input")).toHaveTextContent(
    saved.pose.reference.version_id!,
  );
  expect(screen.getByTestId("confirmed-input")).toHaveTextContent('"record":0');
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByTestId("displayed-file")).toHaveTextContent(
    saved.pose.reference.asset_id,
  );
  await user.click(screen.getByRole("button", { name: "Undo" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByTestId("confirmed-input")).toHaveTextContent(
    original.reference.version_id!,
  );
  expect(screen.getByTestId("confirmed-input")).toHaveTextContent('"record":1');
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Redo" }));
  await user.click(screen.getByRole("radio", { name: "Original result" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByTestId("confirmed-input")).toHaveTextContent(
    original.reference.version_id!,
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("radio", { name: "Original result" })).toBeChecked();
});

it("blocks current-pose continuation while saving but allows an explicit original and freezes its input", async () => {
  nativeReplies();
  let finish!: (value: SavedPose) => void;
  mocks.post.mockImplementation(async (path: string) =>
    path.endsWith("/save")
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : { id: saved.job_id },
  );
  const user = userEvent.setup();
  render(
    <PoseSession frame={frame}>
      <ResearchFlow />
    </PoseSession>,
  );
  await user.click(screen.getByRole("button", { name: "Minimize" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled(),
  );
  await user.click(screen.getByRole("radio", { name: "Original result" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await act(async () => finish(saved));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId("confirmed-input")).toHaveTextContent(
    original.reference.version_id!,
  );
});

it("abandons an old captured input when the selected research source changes", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <PoseSession frame={frame}>
      <ResearchFlow scope="one" />
    </PoseSession>,
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByTestId("confirmed-input")).toBeVisible();
  rerender(
    <PoseSession frame={frame}>
      <ResearchFlow scope="another" />
    </PoseSession>,
  );
  expect(screen.queryByTestId("confirmed-input")).toBeNull();
});

it("normalizes the displayed molecular record to the same selected input record", () => {
  expect(
    posePlan({
      urls: frame.urls,
      molecularSource: { url: frame.urls[0], record: 3 },
    }).base.records,
  ).toEqual([3]);
  expect(
    posePlan({
      urls: frame.urls,
      records: [0],
      molecularSource: { url: frame.urls[0], record: 3 },
    }).base.records,
  ).toEqual([3]);
});
