import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { ExampleJobResult } from "./ExampleJobResult";
const transport = vi.hoisted(() => ({ analysis: vi.fn(), artifacts: vi.fn() }));
vi.mock("../api", () => ({
  api: transport,
  artifactUrl: (id: string, name: string) =>
    `/api/jobs/${id}/download?name=${name}`,
}));
vi.mock("../operations/OperationResults", () => ({
  OperationResults: () => <div>Authoritative native results</div>,
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: () => <div>Extra native viewer</div>,
}));
afterEach(cleanup);
it("uses the operation result's single native presentation instead of fetching and duplicating its first artifact", () => {
  render(
    <ExampleJobResult
      language="en"
      job={
        {
          id: "native-fold",
          request: { operation: "harness", tool: "fold", payload: {} },
        } as unknown as Job
      }
    />,
  );
  expect(screen.getByText("Authoritative native results")).toBeVisible();
  expect(transport.artifacts).not.toHaveBeenCalled();
  expect(screen.queryByText("Extra native viewer")).not.toBeInTheDocument();
});
