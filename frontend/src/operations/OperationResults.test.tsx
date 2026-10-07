import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
