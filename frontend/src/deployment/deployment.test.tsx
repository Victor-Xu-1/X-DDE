import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "../api";
import { DeploymentPanel } from "./DeploymentPanel";
import { linuxLocation, type Deployment } from "./client";
import { Editors } from "../editors/Editors";

const data: Deployment = {
  config: {},
  installed: {},
  default_location: "/home/test/components",
  locations: [],
  operations: [],
  restart_required: false,
  prerequisites: { docker: true, uv: true, gpu_tool: false, supported: true },
  packages: [],
};
it("maps Windows locations without altering Linux paths", () => {
  expect(linuxLocation("E:\\OpenDDE\\Workbench")).toBe(
    "/mnt/e/OpenDDE/Workbench",
  );
  expect(linuxLocation("/data/research")).toBe("/data/research");
});
it("saves location before scheduling only the selected editor components", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({});
  render(
    <DeploymentPanel
      data={data}
      error=""
      refresh={vi.fn()}
      language="zh"
      onEditors={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("安装位置"), {
    target: { value: "E:\\OpenDDE" },
  });
  fireEvent.click(screen.getByRole("button", { name: /先画分子/ }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
  expect(post.mock.calls.map((c) => c[0])).toEqual([
    "/deployment/config",
    "/deployment/packages/ketcher/install",
    "/deployment/packages/molstar/install",
  ]);
  expect(post.mock.calls[0][1]).toEqual({
    location: "/mnt/e/OpenDDE",
    automatic: true,
  });
  post.mockRestore();
});
it("explains failed setup and does not schedule installations after a location error", async () => {
  const post = vi
    .spyOn(api, "post")
    .mockRejectedValue(new Error("Read-only directory"));
  render(
    <DeploymentPanel
      data={data}
      error=""
      refresh={vi.fn()}
      language="en"
      onEditors={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Draw molecules/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Read-only directory",
  );
  expect(post).toHaveBeenCalledTimes(1);
  post.mockRestore();
});
it("offers installation instead of a blank nonfunctional editor iframe", () => {
  const setup = vi.fn();
  render(
    <Editors
      deployment={data}
      language="zh"
      onSetup={setup}
      onCreated={vi.fn()}
    />,
  );
  expect(
    screen.queryByTitle("Ketcher molecular editor"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "前往安装与组件" }));
  expect(setup).toHaveBeenCalledOnce();
});
