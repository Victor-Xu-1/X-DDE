import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { StructureViewer } from "./StructureViewer";

it("clears the prior structure when switching to a task without a result", () => {
  const { rerender } = render(
    <StructureViewer urls={["/references/7RPZ.cif"]} language="zh" />,
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
      value: ["/references/7RPZ.cif"],
    },
    location.origin,
  );
  rerender(<StructureViewer urls={[]} language="zh" />);
  expect(post).toHaveBeenCalledWith(
    { channel: "opendde-viewer", type: "clear", value: undefined },
    location.origin,
  );
  expect(screen.getByText("从预测结果或参考项目载入结构")).toBeVisible();
});
