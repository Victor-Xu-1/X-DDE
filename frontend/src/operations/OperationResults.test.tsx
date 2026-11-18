import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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

it("puts an exact prepared receptor and its report together in one result workspace", async () => {
  transport.result.mockResolvedValue({
    operation: "diffsbdd",
    mode: "prepare",
    structure: "prepared.pdb",
    input_atoms: 100,
    output_atoms: 97,
    removed_atoms: 3,
    notes: "Only the requested input records were retained.",
  });
  render(
    <OperationResults
      job={
        {
          id: "prepare",
          request: { operation: "diffsbdd", payload: { mode: "prepare" } },
        } as Job
      }
      language="en"
    />,
  );
  const workspace = await screen.findByRole("region", {
    name: "Structure preparation result",
  });
  expect(screen.getAllByText(/^Structure:/)).toHaveLength(1);
  expect(
    within(workspace).getByText(/prepare\/artifacts\/prepared.pdb/),
  ).toBeVisible();
  expect(
    screen.getAllByRole("link", { name: "Download structure" }),
  ).toHaveLength(1);
  expect(
    within(workspace).getByRole("link", { name: "Download structure" }),
  ).toHaveAttribute("href", "/api/jobs/prepare/artifacts/prepared.pdb");
  expect(within(workspace).getByText("97")).toBeVisible();
  expect(
    within(workspace).getByText(/requested input records/),
  ).not.toBeVisible();
  fireEvent.click(within(workspace).getByText("Method & result scope"));
  expect(within(workspace).getByText(/requested input records/)).toBeVisible();
});

it("keeps preparation counts readable when no structure artifact was recorded", async () => {
  transport.result.mockResolvedValue({
    operation: "diffsbdd",
    mode: "prepare",
    input_atoms: 100,
  });
  render(
    <OperationResults
      job={
        {
          id: "prepare-without-file",
          request: { operation: "diffsbdd", payload: { mode: "prepare" } },
        } as Job
      }
      language="en"
    />,
  );
  expect(
    await screen.findByText("No structure file was saved with this result."),
  ).toBeVisible();
  expect(screen.getByText("100")).toBeVisible();
  expect(screen.queryByText("Retained atoms")).toBeNull();
  expect(screen.queryByText(/^Structure:/)).toBeNull();
  expect(screen.queryByRole("link", { name: "Download structure" })).toBeNull();
});

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
