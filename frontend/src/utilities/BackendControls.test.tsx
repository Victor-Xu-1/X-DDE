import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import { BackendControls } from "./BackendControls";
import { ComputePowerProvider } from "./ComputeSwitch";
import type { Deployment } from "../deployment/client";
import { PrimaryBackendScope } from "./backend-control-scope";
import {
  FollowupBackendControl,
  TaskBackendControl,
} from "./TaskBackendControl";
import { TaskPresentationContext } from "../guided/TaskPresentation";

vi.mock("../api", () => ({ request: vi.fn(), api: { post: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const entry = {
  id: "chemistry",
  name: "RDKit",
  ready: true,
  enabled: false,
  active: false,
};
it("does not start engines on mount, offers only explicit available switches", async () => {
  vi.mocked(request).mockResolvedValue({
    engines: [entry, { ...entry, id: "admet", name: "ADMET-AI", ready: false }],
  });
  const user = userEvent.setup();
  render(<BackendControls language="en" />);
  expect(request).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Backend controls" }));
  const toggle = await screen.findByRole("switch", { name: "RDKit" });
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(screen.getByRole("switch", { name: "ADMET-AI" })).toBeDisabled();
  vi.mocked(api.post).mockResolvedValue({ enabled: true });
  vi.mocked(request).mockResolvedValue({
    engines: [{ ...entry, enabled: true }],
  });
  await user.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  expect(api.post).toHaveBeenCalledWith(
    "/runtime-controls/chemistry/start",
    {},
  );
  vi.mocked(api.post).mockResolvedValue({ enabled: false });
  vi.mocked(request).mockResolvedValue({ engines: [entry] });
  await user.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  expect(api.post).toHaveBeenLastCalledWith(
    "/runtime-controls/chemistry/stop",
    {},
  );
});

it("shows the current module first and returns to it after closing the full catalogue", async () => {
  vi.mocked(request).mockResolvedValue({
    capabilities: { properties: "chemistry" },
    engines: [entry, { ...entry, id: "admet", name: "ADMET-AI" }],
  });
  const user = userEvent.setup();
  render(
    <>
      <BackendControls
        language="en"
        module={{
          label: ["分子性质", "Molecular properties"],
          tools: ["properties"],
        }}
      />
      <button type="button">Task form</button>
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Backend controls" });
  await waitFor(() =>
    expect(trigger).toHaveAccessibleDescription("Task engines off"),
  );
  await user.click(trigger);
  const module = screen.getByRole("region", {
    name: "Backends in this module",
  });
  expect(
    await within(module).findByRole("switch", { name: "RDKit" }),
  ).not.toBeChecked();
  expect(within(module).queryByRole("switch", { name: "ADMET-AI" })).toBeNull();
  expect(request).toHaveBeenLastCalledWith(
    "/runtime-controls?include_native=false",
    expect.anything(),
  );
  await user.click(
    within(module).getByRole("button", { name: "View all backends" }),
  );
  const all = screen.getByRole("region", { name: "Backend power" });
  expect(
    await within(all).findByRole("switch", { name: "ADMET-AI" }),
  ).not.toBeChecked();
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(all).not.toBeInTheDocument();
  await user.click(trigger);
  const reopened = screen.getByRole("region", {
    name: "Backends in this module",
  });
  expect(reopened).toBeVisible();
  const form = screen.getByRole("button", { name: "Task form" });
  await user.click(form);
  expect(reopened).not.toBeInTheDocument();
  expect(form).toHaveFocus();
  expect(api.post).not.toHaveBeenCalled();
});
it("keeps failed changes off and prevents stopping active tasks", async () => {
  vi.mocked(request).mockResolvedValue({ engines: [entry] });
  vi.mocked(api.post).mockRejectedValue(new Error("conflict"));
  render(<BackendControls language="en" />);
  await userEvent.click(
    screen.getByRole("button", { name: "Backend controls" }),
  );
  await userEvent.click(await screen.findByRole("switch", { name: "RDKit" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("switch", { name: "RDKit" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  cleanup();
  vi.mocked(request).mockResolvedValue({
    engines: [{ ...entry, enabled: true, active: true }],
  });
  render(<BackendControls language="en" />);
  await userEvent.click(
    screen.getByRole("button", { name: "Backend controls" }),
  );
  expect(await screen.findByRole("switch", { name: "RDKit" })).toBeDisabled();
});

it("shares one default-off engine across module, sibling tool and global switches", async () => {
  let enabled = false;
  const user = userEvent.setup();
  const chemistry = {
    ...entry,
    operations: ["properties", "molecular_states"],
  };
  vi.mocked(request).mockImplementation(
    async () =>
      ({
        capabilities: {
          properties: "chemistry",
          "chemistry.states": "chemistry",
        },
        engines: [{ ...chemistry, enabled }],
      }) as never,
  );
  vi.mocked(api.post).mockImplementation(async (path) => {
    enabled = path.endsWith("/start");
    return { enabled } as never;
  });
  render(
    <>
      <TaskBackendControl language="en" scope={{ capability: "properties" }} />
      <TaskBackendControl
        language="en"
        scope={{ capability: "chemistry.states" }}
      />
      <TaskBackendControl
        language="en"
        scope={{ operations: ["properties", "molecular_states"] }}
      />
      <TaskBackendControl
        language="en"
        scope={{ capability: "experimental.evidence" }}
      />
      <BackendControls
        language="en"
        module={{ label: ["分子性质", "Molecular properties"], tools: ["properties"] }}
      />
    </>,
  );
  const toggles = await screen.findAllByRole("switch", { name: "RDKit" });
  expect(toggles).toHaveLength(3);
  toggles.forEach((toggle) => expect(toggle).not.toBeChecked());
  expect(request).toHaveBeenCalledTimes(1);
  expect(api.post).not.toHaveBeenCalled();
  await user.click(toggles[0]);
  await waitFor(() => expect(toggles[0]).toBeChecked());
  const trigger = screen.getByRole("button", { name: "Backend controls" });
  expect(trigger).toHaveAccessibleDescription("1 on");
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "View all backends" }));
  const global = within(screen.getByRole("region", { name: "Backend power" }));
  expect(global.getByRole("switch", { name: "RDKit" })).toBeChecked();
  toggles.forEach((toggle) => expect(toggle).toBeChecked());
  await user.click(global.getByRole("switch", { name: "RDKit" }));
  await waitFor(() => expect(toggles[0]).not.toBeChecked());
  expect(trigger).toHaveAccessibleDescription("Task engines off");
  expect(vi.mocked(api.post).mock.calls.map(([path]) => path)).toEqual([
    "/runtime-controls/chemistry/start",
    "/runtime-controls/chemistry/stop",
  ]);
});

it("only probes native campaign activity when a matching tool is visible", async () => {
  vi.mocked(request).mockImplementation(
    async (path) =>
      ({
        capabilities: { properties: "chemistry", fold: "harness" },
        engines: [
          entry,
          {
            ...entry,
            id: "harness",
            name: "OpenDDE Harness",
            activity_unknown: path.includes("?"),
          },
        ],
      }) as never,
  );
  const { rerender } = render(
    <TaskBackendControl language="en" scope={{ capability: "properties" }} />,
  );
  await screen.findByRole("switch", { name: "RDKit" });
  expect(vi.mocked(request).mock.calls.map(([path]) => path)).toEqual([
    "/runtime-controls?include_native=false",
  ]);
  rerender(<TaskBackendControl language="en" scope={{ capability: "fold" }} />);
  const harness = await screen.findByRole("switch", {
    name: "OpenDDE Harness",
  });
  await waitFor(() => expect(harness).toBeEnabled());
  expect(request).toHaveBeenLastCalledWith(
    "/runtime-controls",
    expect.anything(),
  );
  expect(api.post).not.toHaveBeenCalled();
});

it("does not expose a follow-up switch from a utility form hidden by its example", async () => {
  vi.mocked(request).mockResolvedValue({
    capabilities: { properties: "chemistry" },
    engines: [entry],
  });
  const form = (active: boolean) => (
    <TaskPresentationContext.Provider
      value={{ layout: "single", active, renderResult: () => null }}
    >
      <FollowupBackendControl capability="properties" language="en" />
    </TaskPresentationContext.Provider>
  );
  const { rerender } = render(form(true));
  expect(
    await screen.findByRole("switch", { name: "RDKit" }),
  ).not.toBeChecked();
  rerender(form(false));
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

it("shows shared result and follow-up engines once, retaining different engines", async () => {
  vi.mocked(request).mockResolvedValue({
    capabilities: { humanization: "sapiens", properties: "chemistry" },
    engines: [
      { ...entry, id: "sapiens", name: "Sapiens", operations: ["humanize"] },
      { ...entry, operations: ["properties"] },
    ],
  });
  const scope = { operations: ["humanize"] };
  render(
    <PrimaryBackendScope.Provider value={scope}>
      <TaskBackendControl language="en" placement="result" scope={scope} />
      <TaskBackendControl
        language="en"
        placement="followup"
        scope={{ capability: "humanization" }}
      />
      <TaskBackendControl
        language="en"
        placement="followup"
        scope={{ capability: "properties" }}
      />
    </PrimaryBackendScope.Provider>,
  );
  const toggle = await screen.findByRole("switch", { name: "Sapiens" });
  expect(toggle.closest("[data-backend-placement]")).toHaveAttribute(
    "data-backend-placement",
    "result",
  );
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await screen.findByRole("switch", { name: "RDKit" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(api.post).not.toHaveBeenCalled();
});

it("starts and stops persistent compute from a Harness task and syncs the global switch", async () => {
  const service = { configured: true, running: false, ready: false };
  const refresh = vi.fn();
  vi.mocked(request).mockResolvedValue({
    capabilities: { fold: "harness", properties: "chemistry" },
    engines: [
      entry,
      {
        ...entry,
        id: "harness",
        name: "OpenDDE Harness",
        operations: ["harness"],
      },
    ],
  });
  let confirmStart: (value: typeof service) => void = () => {};
  vi.mocked(api.post).mockImplementation((path) =>
    path.endsWith("/start")
      ? new Promise((resolve) => {
          confirmStart = resolve;
        })
      : Promise.resolve(service),
  );
  const user = userEvent.setup();
  const view = (data: Deployment) => (
    <ComputePowerProvider data={data} error="" refresh={refresh}>
      <TaskBackendControl language="en" scope={{ capability: "fold" }} />
      <TaskBackendControl language="en" scope={{ capability: "properties" }} />
      <BackendControls language="en" />
    </ComputePowerProvider>
  );
  const { rerender } = render(view({ compute_service: service } as Deployment));
  const task = await screen.findByRole("switch", {
    name: "Persistent compute",
  });
  expect(task).not.toBeChecked();
  expect(api.post).not.toHaveBeenCalled();
  await user.click(task);
  expect(task).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Backend controls" }));
  const panel = within(screen.getByRole("region", { name: "Backend power" }));
  const global = panel.getByRole("switch", { name: "Persistent compute" });
  expect(global).toBeDisabled();
  // The app continues polling deployment while the native service starts.
  rerender(view({ compute_service: { ...service } } as Deployment));
  confirmStart({ ...service, running: true, ready: true });
  await waitFor(() => expect(global).toBeChecked());
  expect(task).toBeChecked();
  expect(
    screen.getAllByRole("switch", { name: "OpenDDE Harness" })[0],
  ).not.toBeChecked();
  await user.click(global);
  await waitFor(() => expect(task).not.toBeChecked());
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api.post).mock.calls.map(([path]) => path)).toEqual([
    "/deployment/compute/start",
    "/deployment/compute/stop",
  ]);
});

it("preserves a running service after a rejected shutdown and blocks actively used services", async () => {
  const service = { configured: true, running: true, ready: true };
  vi.mocked(request).mockResolvedValue({
    capabilities: { fold: "harness" },
    engines: [
      {
        ...entry,
        id: "harness",
        name: "OpenDDE Harness",
        operations: ["harness"],
      },
    ],
  });
  vi.mocked(api.post).mockRejectedValue(new Error("busy"));
  const view = (active: number) => (
    <ComputePowerProvider
      data={{ compute_service: { ...service, active } } as Deployment}
      error=""
      refresh={vi.fn()}
    >
      <TaskBackendControl language="zh" scope={{ capability: "fold" }} />
    </ComputePowerProvider>
  );
  const { rerender } = render(view(1));
  const toggle = await screen.findByRole("switch", { name: "常驻计算服务" });
  expect(toggle).toBeChecked();
  expect(toggle).toBeDisabled();
  expect(api.post).not.toHaveBeenCalled();
  rerender(view(0));
  await userEvent.click(toggle);
  expect(await screen.findByRole("alert")).toHaveTextContent("切换未完成");
  expect(toggle).toBeChecked();
  expect(api.post).toHaveBeenCalledTimes(1);
});
