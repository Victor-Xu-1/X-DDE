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
  engines: {},
};
it("maps Windows locations without altering Linux paths", () => {
  expect(linuxLocation("E:\\OpenDDE\\Workbench")).toBe(
    "/mnt/e/OpenDDE/Workbench",
  );
  expect(linuxLocation("/data/research")).toBe("/data/research");
});
it("uses catalogue names for new scientific components and removal review", () => {
  render(
    <DeploymentPanel
      data={{
        ...data,
        installed: { diffsbdd: { version: "55f365b" } },
        packages: [
          {
            id: "diffsbdd",
            engine: "diffsbdd",
            kind: "runtime",
            name: "DiffSBDD",
            version: "55f365b",
            description: "小分子设计科学环境 / Small-molecule design runtime",
            size: "Several GB",
            automatic: false,
            license: "MIT",
          },
          {
            id: "diffsbdd-model-crossdock_full",
            engine: "diffsbdd",
            kind: "model",
            name: "DiffSBDD · crossdock_full",
            version: "model-sha",
            description: "官方固定模型 / Official pinned checkpoint",
            size: "74 MiB",
            automatic: false,
            license: "Official model terms",
          },
        ],
      }}
      error=""
      refresh={vi.fn()}
      language="zh"
      onEditors={vi.fn()}
    />,
  );
  expect(screen.getByRole("heading", { name: "DiffSBDD" })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "DiffSBDD · crossdock_full" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "卸载" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("卸载 DiffSBDD？");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
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

it("preserves the molecule editor while switching to protein inspection", () => {
  render(
    <Editors
      deployment={{
        ...data,
        installed: {
          ketcher: { version: "3.18.0" },
          molstar: { version: "5.12.0" },
        },
      }}
      language="zh"
      onSetup={vi.fn()}
      onCreated={vi.fn()}
    />,
  );
  const sketch = screen.getByTitle("Ketcher molecular editor");
  fireEvent.click(screen.getByRole("button", { name: "蛋白与复合物 · Mol*" }));
  expect(screen.getByTitle("Ketcher molecular editor")).toBe(sketch);
  expect(sketch).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "分子绘图 · Ketcher" }));
  expect(screen.getByTitle("Ketcher molecular editor")).toBe(sketch);
  expect(sketch).toBeVisible();
});

it("installs the selected DiffSBDD environment independently of OpenDDE", async () => {
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
  fireEvent.click(
    screen.getByRole("button", { name: /安装 DiffSBDD 小分子设计环境/ }),
  );
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls.map((c) => c[0])).toEqual([
    "/deployment/config",
    "/deployment/packages/diffsbdd/install",
  ]);
  post.mockRestore();
});

it("saves the base of an existing managed location without nesting it", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({});
  render(
    <DeploymentPanel
      data={{ ...data, config: { root: "/srv/components/x-dde-managed" } }}
      error=""
      refresh={vi.fn()}
      language="en"
      onEditors={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Installation location")).toHaveValue(
    "/srv/components",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save location" }));
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(post.mock.calls[0][1]).toMatchObject({ location: "/srv/components" });
  post.mockRestore();
});
