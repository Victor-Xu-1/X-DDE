import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { StructureViewer } from "./StructureViewer";

it("clears the prior structure when switching to a task without a result", () => {
  const { rerender } = render(
    <StructureViewer
      urls={["/api/jobs/abc/download?name=result.cif"]}
      language="zh"
    />,
  );
  const frame = screen.getByTitle("可交互分子结构") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: frame.contentWindow,
        data: { channel: "opendde-viewer", type: "ready" },
      }),
    );
  });
  expect(post).toHaveBeenCalledWith(
    {
      channel: "opendde-viewer",
      type: "load",
      value: ["/api/jobs/abc/download?name=result.cif"],
    },
    location.origin,
  );
  rerender(<StructureViewer urls={[]} language="zh" />);
  expect(post).toHaveBeenCalledWith(
    { channel: "opendde-viewer", type: "clear", value: undefined },
    location.origin,
  );
  expect(screen.getByText("预测完成后，结构会显示在这里")).toBeVisible();
});

it("focuses the actual ligand source and exposes only supported overlay controls", () => {
  render(
    <StructureViewer
      urls={[
        "/api/jobs/j/download?name=receptor.pdb",
        "/api/jobs/j/download?name=pose-001.sdf",
      ]}
      language="en"
      focusModel={1}
    />,
  );
  const frame = screen.getByTitle(
    "Interactive molecular structure",
  ) as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: frame.contentWindow,
        data: {
          channel: "opendde-viewer",
          type: "loaded",
          detail: {
            atoms: 10,
            chains: ["A"],
            ligands: [],
            residues: [],
            hasPolymer: true,
            options: {
              mode: "cartoon",
              radius: 5,
              labels: true,
              ligand: "",
              pick: "residue",
            },
          },
        },
      }),
    ),
  );
  expect(post).toHaveBeenCalledWith(
    { channel: "opendde-viewer", type: "focus-model", value: 1 },
    location.origin,
  );
  expect(
    screen.getByRole("button", { name: "Focus selected ligand" }),
  ).toBeVisible();
  expect(screen.queryByText("Surface", { exact: true })).toBeNull();
  expect(
    screen.queryByText("Selection and display editing", { exact: true }),
  ).toBeNull();
});
