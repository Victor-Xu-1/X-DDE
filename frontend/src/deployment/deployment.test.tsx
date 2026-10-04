import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { DeploymentPanel } from "./DeploymentPanel";
import { linuxLocation, type Deployment } from "./client";
import { Editors } from "../editors/Editors";
import { packageOf, deploymentFixture } from "./fixtures";

afterEach(() => vi.restoreAllMocks());
const data = deploymentFixture([packageOf("ketcher"), packageOf("molstar")]);
function fresh(snapshot: Deployment) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true, json: async () => snapshot } as Response);
}
function panel(
  snapshot = data,
  language: "zh" | "en" = "zh",
  refresh = vi.fn(),
) {
  render(
    <DeploymentPanel
      data={snapshot}
      error=""
      refresh={refresh}
      language={language}
    />,
  );
}
it("maps Windows locations without altering Linux paths", () => {
  expect(linuxLocation("E:\\OpenDDE\\Workbench")).toBe(
    "/mnt/e/OpenDDE/Workbench",
  );
  expect(linuxLocation("/data/research")).toBe("/data/research");
});
it("preserves new catalogue components and secondary removal review", () => {
  panel(
    deploymentFixture(
      [
        packageOf("diffsbdd", { name: "DiffSBDD", engine: "diffsbdd" }),
        packageOf("diffsbdd-model-crossdock_full", {
          name: "DiffSBDD · crossdock_full",
          engine: "diffsbdd",
          kind: "model",
        }),
      ],
      { installed: { diffsbdd: { version: "1" } } },
    ),
  );
  expect(screen.getByRole("heading", { name: "DiffSBDD" })).toBeVisible();
  const extra = screen.getByText(/可选模型与配套组件/, { selector: "summary" });
  expect(extra.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(extra);
  expect(
    screen.getByRole("heading", { name: "DiffSBDD · crossdock_full" }),
  ).toBeVisible();
  const card = within(screen.getByRole("article", { name: "DiffSBDD" }));
  expect(card.getByRole("button", { name: "卸载" })).not.toBeVisible();
  fireEvent.click(card.getByText("维护"));
  fireEvent.click(card.getByRole("button", { name: "卸载" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("卸载 DiffSBDD？");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
it("saves location before scheduling the selected viewer bundle", async () => {
  fresh(data);
  const post = vi.spyOn(api, "post").mockResolvedValue({});
  panel();
  fireEvent.change(screen.getByLabelText("选择安装目录"), {
    target: { value: "custom" },
  });
  fireEvent.change(screen.getByLabelText("自定义安装目录"), {
    target: { value: "E:\\OpenDDE" },
  });
  fireEvent.click(screen.getByRole("button", { name: "部署推荐组合" }));
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
});
it("explains location failures without creating an installation", async () => {
  fresh(data);
  const post = vi
    .spyOn(api, "post")
    .mockRejectedValue(new Error("Read-only directory"));
  panel(data, "en");
  fireEvent.click(
    screen.getByRole("button", { name: "Install recommended bundle" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Read-only directory",
  );
  expect(post).toHaveBeenCalledTimes(1);
});
it("installed status cannot trigger reinstall and location is visible", () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({});
  panel({
    ...data,
    installed: { ketcher: { version: "1" }, molstar: { version: "1" } },
  });
  const installed = screen.getAllByRole("button", { name: "已安装" });
  expect(installed).toHaveLength(2);
  installed.forEach((button) => {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  });
  expect(screen.getByRole("button", { name: "组合已安装" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "重新安装" })).toBeNull();
  expect(screen.getByLabelText("选择安装目录")).toBeVisible();
  expect(screen.queryByText("安装历史")).toBeNull();
  expect(screen.queryByText("终端命令")).toBeNull();
  expect(post).not.toHaveBeenCalled();
});
it("group filters retain native model choices and fallback components", () => {
  panel(
    deploymentFixture([
      packageOf("ketcher"),
      packageOf("diffsbdd", { engine: "diffsbdd" }),
      packageOf("future-tool"),
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: "分子生成 · DiffSBDD" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "diffsbdd" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "其他组件" }));
  expect(screen.getByRole("article", { name: "future-tool" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "全部" }));
  expect(screen.getAllByRole("article")).toHaveLength(3);
});
it("shows each main component once and deploys only the selected research group", async () => {
  const snapshot = deploymentFixture([
    packageOf("ketcher"),
    packageOf("molstar"),
    packageOf("compute", { engine: "opendde" }),
    packageOf("standard", { engine: "opendde", kind: "model" }),
    packageOf("abag", { engine: "opendde", kind: "model" }),
  ]);
  fresh(snapshot);
  const post = vi.spyOn(api, "post").mockResolvedValue({});
  panel(snapshot);
  const mainCards = () =>
    screen
      .getAllByRole("article")
      .filter((card) => !card.closest(".component-additions"));
  expect(mainCards()).toHaveLength(4);
  expect(
    screen.getByRole("article", { name: "OpenDDE 抗体预测模型" }),
  ).not.toBeVisible();
  expect(screen.queryByRole("button", { name: "部署推荐组合" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "结构预测 · OpenDDE" }));
  expect(mainCards()).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "部署推荐组合" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
  expect(post.mock.calls.map((call) => call[0])).toEqual([
    "/deployment/config",
    "/deployment/packages/compute/install",
    "/deployment/packages/standard/install",
  ]);
  fireEvent.click(
    screen.getByText(/可选模型与配套组件/, { selector: "summary" }),
  );
  expect(
    screen.getByRole("article", { name: "OpenDDE 抗体预测模型" }),
  ).toBeVisible();
});
it("keeps pending or unresolved optional components visible without duplicating main cards", () => {
  panel(
    deploymentFixture(
      [
        packageOf("diffsbdd", { engine: "diffsbdd" }),
        packageOf("optional-model", { engine: "diffsbdd", kind: "model" }),
      ],
      {
        operations: [
          {
            id: "failed-optional",
            package: "optional-model",
            action: "install",
            state: "failed",
            stage: "install",
            error: "Interrupted",
          },
        ],
      },
    ),
  );
  expect(screen.getByRole("article", { name: "optional-model" })).toBeVisible();
  expect(screen.getAllByRole("article", { name: "diffsbdd" })).toHaveLength(1);
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
  expect(sketch).toBeVisible();
});
it("installs DiffSBDD independently without an OpenDDE request", async () => {
  const snapshot = deploymentFixture([
    packageOf("diffsbdd", { engine: "diffsbdd" }),
  ]);
  fresh(snapshot);
  const post = vi.spyOn(api, "post").mockResolvedValue({});
  panel(snapshot);
  fireEvent.click(screen.getByRole("button", { name: "部署推荐组合" }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls.map((c) => c[0])).toEqual([
    "/deployment/config",
    "/deployment/packages/diffsbdd/install",
  ]);
});
it("saves an existing managed location base without nesting it", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({});
  panel({ ...data, config: { root: "/srv/components/x-dde-managed" } }, "en");
  expect(screen.getByLabelText("Choose install location")).toHaveValue(
    "/srv/components",
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm location" }));
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(post.mock.calls[0][1]).toMatchObject({ location: "/srv/components" });
});
it("guards double clicks and refreshes partial failed bundles", async () => {
  fresh(data);
  let release: (() => void) | undefined;
  const post = vi.spyOn(api, "post").mockImplementation(async (path) => {
    if (path === "/deployment/config")
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    if (path.includes("molstar")) throw new Error("Disconnected");
    return {};
  });
  const refresh = vi.fn();
  panel(data, "zh", refresh);
  const bundle = screen.getByRole("button", { name: "部署推荐组合" });
  fireEvent.click(bundle);
  fireEvent.click(bundle);
  await waitFor(() => expect(release).toBeDefined());
  release!();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "已加入 1/2 项安装",
  );
  expect(post).toHaveBeenCalledTimes(3);
  expect(refresh).toHaveBeenCalledOnce();
});

it("keeps an empty custom-location draft across polling and protects installed environments", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue({});
  const snapshot = {
    ...data,
    config: { root: "/srv/current/x-dde-managed" },
    installed: { ketcher: { version: "1" } },
  };
  const props = {
    data: snapshot,
    error: "",
    refresh: vi.fn(),
    language: "zh" as const,
  };
  const { rerender } = render(<DeploymentPanel {...props} />);
  fireEvent.change(screen.getByLabelText("选择安装目录"), {
    target: { value: "custom" },
  });
  expect(screen.getByLabelText("自定义安装目录")).toHaveValue("");
  rerender(<DeploymentPanel {...props} data={{ ...snapshot }} />);
  expect(screen.getByLabelText("自定义安装目录")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("自定义安装目录"), {
    target: { value: "E:\\WSL\\apps\\new-location" },
  });
  expect(screen.getByRole("button", { name: "保存目录" })).toBeDisabled();
  expect(screen.getByText(/现有文件保持原位/)).toBeVisible();
  expect(post).not.toHaveBeenCalled();
});
