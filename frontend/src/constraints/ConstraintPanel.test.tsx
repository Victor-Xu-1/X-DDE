import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as transport from "../api";
import { ConstraintPanel } from "./ConstraintPanel";
import { task } from "../docking/model";
import { defaults } from "../docking/generated";
const subject = {
    asset_id: "ligand",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  },
  receptor = { ...subject, asset_id: "receptor" };
const draft = task(
  "dock",
  receptor,
  subject,
  defaults,
  null,
  { center: [1, 2, 3], size: [20, 20, 20], unit: "angstrom" },
  false,
  "dock",
);
afterEach(() => vi.restoreAllMocks());
it("saves the current supported condition, retains revision provenance, and exposes errors", async () => {
  vi.spyOn(transport, "request").mockResolvedValue([] as never);
  const change = vi.fn(),
    post = vi
      .spyOn(transport.api, "post")
      .mockImplementation(
        async (path, body) =>
          ({ id: "new", sha256: "b".repeat(64), body }) as never,
      ),
    user = userEvent.setup();
  render(
    <ConstraintPanel
      subject={subject}
      language="zh"
      value={null}
      onChange={change}
      onApply={vi.fn()}
      getTask={() => draft}
    />,
  );
  await user.click(screen.getByText("保存与复用任务条件（可选）"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存当前条件" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "保存当前条件" }));
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(post.mock.calls[0][1]).toMatchObject({
    subject,
    frame: { reference: receptor },
    conditions: [{ kind: "search_box" }],
  });
  expect(change).toHaveBeenCalledWith({ id: "new", sha256: "b".repeat(64) });
  post.mockRejectedValue(new Error("Save failed"));
  await user.click(screen.getByRole("button", { name: "保存当前条件" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
});
it("reads an existing version and blocks misleading native support claims", async () => {
  const body = { name: "prior", subject, conditions: [] },
    reference = { id: "old", sha256: "b".repeat(64) };
  vi.spyOn(transport, "request").mockResolvedValue([
    { ...reference, body },
  ] as never);
  vi.spyOn(transport.api, "post").mockResolvedValue({
    executable: false,
    conditions: [
      {
        condition_id: "c",
        supported: false,
        reason_code: "different_parameters",
        support: "unsupported",
      },
    ],
  } as never);
  const user = userEvent.setup();
  render(
    <ConstraintPanel
      subject={subject}
      language="en"
      value={reference}
      onChange={vi.fn()}
      onApply={vi.fn()}
      getTask={() => draft}
    />,
  );
  await user.click(
    screen.getByText("Save and reuse task conditions (optional)"),
  );
  await user.click(
    screen.getByRole("button", { name: "Check engine support" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Conditions cannot run on this task",
  );
  expect(screen.getByText(/Independent result verification:/)).toBeVisible();
});
