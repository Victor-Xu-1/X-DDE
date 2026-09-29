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
