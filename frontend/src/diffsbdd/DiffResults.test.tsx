import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DiffResults } from "./DiffResults";
import { artifactUrl, api } from "../api";
import * as client from "../api";
import type { Job } from "../types";
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <output data-testid="native-preview">{urls.join("|")}</output>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("previews the retained native molecule file even before scientific objects are registered", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  const submit = vi.spyOn(api, "submit"),
    name = "native/20261002T021243Z_reviewed/molecules.sdf";
  render(
    <DiffResults
      language="zh"
      job={
        {
          id: "case",
          request: { operation: "diffsbdd", mode: "generate" },
        } as unknown as Job
      }
      data={{
        operation: "diffsbdd",
        complete: true,
        molecule_artifact: name,
        protein_artifact: "native/protein.pdb",
      }}
    />,
  );
  expect(screen.getAllByTestId("native-preview").map(node=>node.textContent)).toContain(artifactUrl("case",name));
  const link = screen.getByRole("link", { name: "分子结构 · SDF" });
  expect(link).toHaveAttribute("href", artifactUrl("case", name));
  expect(link).toHaveAttribute("title", "molecules.sdf");
  expect(screen.queryByText(name, { exact: true })).not.toBeInTheDocument();
  await waitFor(() => expect(client.request).toHaveBeenCalled());
  expect(submit).not.toHaveBeenCalled();
});
