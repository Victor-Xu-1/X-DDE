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
