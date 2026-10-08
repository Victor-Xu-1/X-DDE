import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OperationResults } from "./OperationResults";
import type { Job } from "../types";

const transport = vi.hoisted(() => ({ result: vi.fn() }));
vi.mock("../api", () => ({
  api: transport,
  artifactUrl: (id: string, name: string) =>
    `/api/jobs/${id}/artifacts/${name}`,
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <p>Structure: {urls.join(",")}</p>
  ),
}));
vi.mock("../space/ChannelResults", () => ({
  ChannelResults: () => <div>Reviewed native channels</div>,
}));
afterEach(cleanup);

it("does not relabel old result data or a late response as a newly selected job", async () => {
  let finishOld!: (value: unknown) => void;
  const old = new Promise((resolve) => {
    finishOld = resolve;
  });
  transport.result.mockImplementation((id: string) =>
    id === "old"
      ? old
      : Promise.resolve({ operation: "inspect", structure: "new.cif" }),
  );
  const request = { operation: "inspect" };
  const { rerender } = render(
    <OperationResults
      job={{ id: "old", request } as unknown as Job}
      language="en"
    />,
  );
  rerender(
    <OperationResults
      job={{ id: "new", request } as unknown as Job}
      language="en"
    />,
  );
  expect(await screen.findByText(/new\/artifacts\/new.cif/)).toBeVisible();
  await act(async () => {
    finishOld({ operation: "inspect", structure: "old.cif" });
    await old;
  });
  expect(screen.queryByText(/old.cif/)).not.toBeInTheDocument();
  expect(screen.getAllByText(/^Structure:/)).toHaveLength(1);
});

it("keeps method notes on demand and input preview identity visible", async () => {
  transport.result.mockResolvedValue({
    operation: "inspect",
    notes: "Coordinates represent the supplied structure, not a prediction.",
    structure: "input.cif",
  });
  render(
    <OperationResults
      job={{ id: "input-preview", request: { operation: "inspect" } } as Job}
      language="zh"
    />,
  );
  expect(
    await screen.findByRole("heading", { name: "输入结构预览（非预测结果）" }),
  ).toBeVisible();
  expect(screen.getByText(/supplied structure/)).not.toBeVisible();
  fireEvent.click(screen.getByText("方法与结果范围"));
  expect(screen.getByText(/supplied structure/)).toBeVisible();
  expect(screen.getByText(/input-preview\/artifacts\/input.cif/)).toBeVisible();
});

it("does not treat a typed structural reference as a second artifact preview", async () => {
  transport.result.mockResolvedValue({
    operation: "channel_analysis",
    complete: true,
    structure: { asset_id: "immutable-input", sha256: "a".repeat(64) },
  });
  render(
    <OperationResults
      job={
        { id: "channels", request: { operation: "channel_analysis" } } as Job
      }
      language="en"
    />,
  );
  expect(await screen.findByText("Reviewed native channels")).toBeVisible();
  expect(screen.queryByText(/^Structure:/)).toBeNull();
});

it("renders each explicitly linked native candidate structure only through its candidate inspector", async () => {
  transport.result.mockResolvedValue({
    operation: "harness",
    complete: true,
    structure: "native.cif",
    structures: ["native.cif"],
    result: {
      candidates: [
        {
          candidate_id: "Rb-H2",
          sequence: "EVQLVESGG",
          structure_path: "native.cif",
          metrics: { iptm: 0.3283 },
        },
      ],
    },
  });
  render(
    <OperationResults
      job={
        {
          id: "native-fold",
          request: { operation: "harness", tool: "fold", payload: {} },
        } as unknown as Job
      }
      language="en"
    />,
  );
  expect(
    await screen.findByRole("tab", { name: "3D structure" }),
  ).toHaveAttribute("aria-selected", "true");
  expect(screen.getAllByText(/^Structure:/)).toHaveLength(1);
});

it("retains registered structure files when the native candidate result is unavailable", async () => {
  transport.result.mockResolvedValue({
    operation: "harness",
    complete: true,
    structures: ["unassigned.cif"],
    result: {
      available: false,
      reason: "No eligible structures",
      result: null,
    },
  });
  render(
    <OperationResults
      job={
        {
          id: "no-candidates",
          request: { operation: "harness", tool: "fold", payload: {} },
        } as unknown as Job
      }
      language="en"
    />,
  );
  expect(await screen.findByText("No eligible structures")).toBeVisible();
  fireEvent.click(screen.getByText("3D structure 1"));
  expect(screen.getByText(/unassigned.cif/)).toBeVisible();
});
