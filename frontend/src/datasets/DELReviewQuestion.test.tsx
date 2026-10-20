import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DELReviewQuestion } from "./DELReviewQuestion";
import { defaultDELExecution } from "./del-template";
import type { DELFormState } from "./useDELForm";

afterEach(cleanup);
const model = (zh = false) =>
  ({
    zh,
    mode: "candidates",
    name: "Reviewed handoff",
    setName: vi.fn(),
    definition: { label: ["候选交接", "Candidate handoff"] },
    source: [{ name: "Original count study" }],
    definitions: [],
    asset: null,
    selected: ["A048-B082-C024", "A035-B040-C030"],
    attachmentPolicy: "cap_hydrogen",
    comparison: "e2",
    availableComparisons: [
      { id: "e2", selection: "BRD4_E2", reference: "Matrix_E2" },
    ],
    execution: defaultDELExecution(),
    setExecution: vi.fn(),
  }) as unknown as DELFormState;

it("makes exact members, comparison and off-DNA derivation reviewable before submission", async () => {
  render(<DELReviewQuestion model={model()} />);
  expect(screen.getByText("2")).toBeVisible();
  expect(screen.getByText("BRD4_E2 / Matrix_E2")).toBeVisible();
  expect(
    screen.getByText("Cap terminal attachment with hydrogen"),
  ).toBeVisible();
  await userEvent.setup().click(screen.getByText("Review selected members"));
  expect(screen.getByText("A048-B082-C024")).toBeVisible();
  expect(screen.getByText("A035-B040-C030")).toBeVisible();
  expect(screen.queryByText(/report_sha256|job_id|JSON/)).toBeNull();
});

it("updates the displayed selection and chemistry choice rather than retaining a former review", async () => {
  const value = model(true);
  const { rerender } = render(<DELReviewQuestion model={value} />);
  await userEvent.setup().click(screen.getByText("查看所选成员"));
  rerender(
    <DELReviewQuestion
      model={{
        ...value,
        selected: ["A048-B082-C024"],
        attachmentPolicy: "retain",
      }}
    />,
  );
  expect(screen.getByText("1")).toBeVisible();
  expect(screen.getByText("保留原始结构")).toBeVisible();
  expect(screen.queryByText("A035-B040-C030")).toBeNull();
});
