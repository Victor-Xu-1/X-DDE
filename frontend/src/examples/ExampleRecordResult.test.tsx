import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ExampleRecordResult } from "./ExampleRecordResult";
import type { PreparedExample } from "./types";

const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../api", () => ({ request: transport.request, api: {} }));
vi.mock("./ExampleJobResult", () => ({
  ExampleJobResult: ({ job }: { job: { id: string } }) => (
    <p>Native result {job.id}</p>
  ),
}));

function example(gated: boolean): PreparedExample {
  return {
    record: {
      kind: "workflows",
      pin: { record_id: "retained-plan" },
      value: {
        body: {
          steps: [
            { id: "dock", request: { name: "Dock selected molecule" } },
            {
              id: "quality",
              request: { name: "Review pose" },
              ...(gated
                ? { quality_gate: { required_checks: ["sanitization"] } }
                : {}),
            },
            { id: "properties", request: { name: "Compare properties" } },
          ],
        },
      },
      run: {
        attempts: [
          { step_id: "dock", job_id: "new-dock" },
          { step_id: "quality", job_id: "new-quality" },
          { step_id: "properties", job_id: "new-properties" },
        ],
      },
    },
  } as unknown as PreparedExample;
}

it("explains a measured handoff and loads the exact selected native child result", async () => {
  transport.request.mockImplementation((path: string) =>
    Promise.resolve({ id: path.split("/").at(-1) }),
  );
  render(<ExampleRecordResult example={example(true)} language="en" />);
  expect(screen.getByText(/plan's required quality checks/)).toBeVisible();
  await screen.findByText("Native result new-dock");
  fireEvent.click(screen.getByRole("button", { name: "2. Review pose" }));
  await screen.findByText("Native result new-quality");
  expect(screen.queryByText("Native result new-dock")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "3. Compare properties" }),
  );
  await screen.findByText("Native result new-properties");
  await waitFor(() =>
    expect(transport.request).toHaveBeenLastCalledWith(
      "/jobs/new-properties",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ),
  );
});

it("does not claim pose quality or a docking-to-properties chain for an ungated historical plan", () => {
  transport.request.mockResolvedValue({ id: "new-dock" });
  render(<ExampleRecordResult example={example(false)} language="zh" />);
  expect(
    screen.getByText("研究已按所列步骤完成。选择一步查看它的真实输出。"),
  ).toBeVisible();
  expect(screen.queryByText(/质控检查/)).toBeNull();
  expect(screen.queryByText(/对接产物/)).toBeNull();
});
