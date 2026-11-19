import {
  act,
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
import { ImageMoleculeInput } from "./ImageMoleculeInput";
import { RecognitionBackendEntry } from "./RecognitionBackendEntry";
import { useRecognitionStatus } from "./recognition-power";

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
it("shows only the selected task's engine beside the module menu", async () => {
  const admet = { ...entry, id: "admet", name: "ADMET", enabled: true };
  vi.mocked(request).mockResolvedValue({
    capabilities: { properties: "chemistry", "admet.predict": "admet" },
    engines: [entry, admet],
  });
  const module = {
    label: ["性质", "Properties"] as const,
    tools: ["properties", "admet.predict"] as const,
  };
  const { rerender } = render(
    <BackendControls
      language="en"
      module={module}
      currentCapability="properties"
    />,
  );
  const task = await screen.findByRole("group", {
    name: "Backend for this task",
  });
  expect(within(task).getByRole("switch", { name: "RDKit" })).not.toBeChecked();
  expect(within(task).queryByRole("switch", { name: "ADMET" })).toBeNull();
  rerender(
    <BackendControls
      language="en"
      module={module}
      currentCapability="admet.predict"
    />,
  );
  expect(
    await within(task).findByRole("switch", { name: "ADMET" }),
  ).toBeChecked();
  expect(vi.mocked(api.post)).not.toHaveBeenCalled();
});

it("keeps the current task's backend status and retry visible if the first read fails", async () => {
  vi.mocked(request)
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue({
      capabilities: { properties: "chemistry" },
      engines: [entry],
    });
  render(<BackendControls language="en" currentCapability="properties" />);
  const task = screen.getByRole("group", { name: "Backend for this task" });
  const warning = await within(task).findByRole("alert");
  expect(warning).toHaveTextContent("Cannot read backend state.");
  expect(within(task).queryByRole("switch")).toBeNull();
  await userEvent.click(within(warning).getByRole("button", { name: "Retry" }));
  expect(
    await within(task).findByRole("switch", { name: "RDKit" }),
  ).not.toBeChecked();
  expect(api.post).not.toHaveBeenCalled();
});

it("keeps an example's additional engine and omits an already visible switch", async () => {
  const admet = {
    ...entry,
    id: "admet",
    name: "ADMET",
    operations: ["admet_predict"],
  };
  vi.mocked(request).mockResolvedValue({
    capabilities: { properties: "chemistry" },
    engines: [{ ...entry, operations: ["properties"] }, admet],
  });
  render(
    <PrimaryBackendScope.Provider value={{ capability: "properties" }}>
      <TaskBackendControl
        language="en"
        scope={{ operations: ["properties", "admet_predict"] }}
        placement="example"
      />
    </PrimaryBackendScope.Provider>,
  );
  expect(
    await screen.findByRole("switch", { name: "ADMET" }),
  ).not.toBeChecked();
  expect(screen.queryByRole("switch", { name: "RDKit" })).toBeNull();
  expect(vi.mocked(api.post)).not.toHaveBeenCalled();
});

it("finds the backend by its task name and keeps the current engine first", async () => {
  vi.mocked(request).mockResolvedValue({
    capabilities: {
      properties: "chemistry",
      "admet.predict": "admet",
      "admet.brain": "admet",
      "chemprop.train": "chemprop",
      "p2rank.detect": "p2rank",
    },
    engines: [
      entry,
      { ...entry, id: "chemprop", name: "Chemprop" },
      { ...entry, id: "admet", name: "ADMET-AI" },
      { ...entry, id: "p2rank", name: "P2Rank" },
    ],
  });
  const user = userEvent.setup();
  render(
    <BackendControls
      language="en"
      module={{
        label: ["性质与安全性", "Properties and safety"],
        tools: ["properties", "admet.predict", "admet.brain", "chemprop.train"],
      }}
      currentCapability="admet.predict"
    />,
  );
  await user.click(screen.getByRole("button", { name: "Backend controls" }));
  const panel = within(
    screen.getByRole("region", { name: "Backends in this module" }),
  );
  const field = await panel.findByRole("searchbox", {
    name: "Find a task or backend",
  });
  expect(
    panel
      .getAllByRole("switch")
      .map((element) => element.getAttribute("aria-label")),
  ).toEqual(["ADMET-AI", "RDKit", "Chemprop"]);
  await user.type(field, "透脑评估");
  expect(panel.getAllByRole("switch")).toHaveLength(1);
  expect(panel.getByRole("switch", { name: "ADMET-AI" })).not.toBeChecked();
  await user.clear(field);
  await user.type(field, "P2Rank");
  expect(panel.getByRole("status")).toHaveTextContent("No matching backends");
  await user.click(panel.getByRole("button", { name: "View all backends" }));
  const all = within(screen.getByRole("region", { name: "Backend power" }));
  expect(all.getByRole("searchbox")).toHaveValue("");
  expect(all.getByRole("switch", { name: "P2Rank" })).not.toBeChecked();
  expect(api.post).not.toHaveBeenCalled();
});

it("reports active tasks even when the recovered engine permission is off", async () => {
  vi.mocked(request).mockResolvedValue({
    capabilities: { properties: "chemistry" },
    engines: [{ ...entry, active: true }],
  });
  render(
    <BackendControls
      language="en"
      inlineSingle
      module={{
        label: ["分子性质", "Molecular properties"],
        tools: ["properties"],
      }}
    />,
  );
  const power = await screen.findByRole("switch", { name: "RDKit" });
  expect(power).not.toBeChecked();
  expect(power).toBeDisabled();
  expect(power).toHaveAccessibleDescription("Task active");
  expect(
    screen.getByRole("button", { name: "Backend controls" }),
  ).toHaveAccessibleDescription("Tasks active");
});

it("keeps keyboard focus on an engine switch while the server confirms the change", async () => {
  let enabled = false;
  let finish: (result: { enabled: boolean }) => void = () => {};
  vi.mocked(request).mockImplementation(async () => ({
    capabilities: { properties: "chemistry" },
    engines: [{ ...entry, enabled }],
  }));
  vi.mocked(api.post).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const user = userEvent.setup();
  render(<BackendControls language="en" currentCapability="properties" />);
  const toggle = await screen.findByRole("switch", { name: "RDKit" });
  toggle.focus();
  await user.keyboard(" ");
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute("aria-disabled", "true");
  await user.keyboard(" ");
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => {
    enabled = true;
    finish({ enabled });
  });
  expect(toggle).toHaveFocus();
  expect(toggle).toBeChecked();
  expect(toggle).not.toHaveAttribute("aria-disabled", "true");
});

it("switches DECIMER from a utility without leaving the current tab", async () => {
  const onOpen = vi.fn();
  const user = userEvent.setup();
  let recognition = { phase: "stopped", enabled: false };
  vi.mocked(request).mockImplementation(
    async (path) =>
      (path.startsWith("/utilities/recognition")
        ? { available: true, idle_power: true, power: recognition }
        : {
            capabilities: { properties: "chemistry" },
            engines: [entry],
          }) as never,
  );
  vi.mocked(api.post).mockImplementation(async (path) => {
    const on = path.endsWith("/start");
    recognition = { phase: on ? "ready" : "stopped", enabled: on };
    return { available: true, idle_power: true, power: recognition } as never;
  });
  render(
    <BackendControls
      language="en"
      module={{ label: ["小工具", "Utilities"], tools: ["properties"] }}
      moduleHasRecognition
      onOpenRecognition={onOpen}
    />,
  );
  const menu = screen.getByRole("button", { name: "Backend controls" });
  await user.click(menu);
  const power = await screen.findByRole("switch", { name: "DECIMER" });
  await waitFor(() => expect(power).toBeEnabled());
  expect(power).not.toBeChecked();
  expect(api.post).not.toHaveBeenCalled();

  await user.click(power);
  await waitFor(() => expect(power).toBeChecked());
  expect(menu).toHaveAccessibleDescription("1 on");
  expect(screen.getByRole("switch", { name: "RDKit" })).not.toBeChecked();
  await user.click(power);
  await waitFor(() => expect(power).not.toBeChecked());
  expect(menu).toHaveAccessibleDescription("Task engines off");
  expect(api.post).toHaveBeenNthCalledWith(
    1,
    "/utilities/recognition/start",
    {},
  );
  expect(api.post).toHaveBeenNthCalledWith(
    2,
    "/utilities/recognition/stop",
    {},
  );
  expect(onOpen).not.toHaveBeenCalled();
});

it("requires fresh DECIMER state after a power response arrives while closed", async () => {
  const user = userEvent.setup();
  const stopped = {
    available: true,
    idle_power: true,
    power: { phase: "stopped", enabled: false },
  };
  let hold = false;
  let resolveStatus: (value: unknown) => void = () => {};
  const fresh = new Promise((resolve) => {
    resolveStatus = resolve;
  });
  let resolveToggle: (value: unknown) => void = () => {};
  const toggled = new Promise((resolve) => {
    resolveToggle = resolve;
  });
  vi.mocked(api.post).mockImplementation(async () => toggled as never);
  vi.mocked(request).mockImplementation(
    async (path) =>
      (path.startsWith("/utilities/recognition")
        ? hold
          ? fresh
          : stopped
        : { engines: [] }) as never,
  );
  render(<BackendControls language="en" onOpenRecognition={vi.fn()} />);
  const menu = screen.getByRole("button", { name: "Backend controls" });
  await user.click(menu);
  await waitFor(() =>
    expect(screen.getByRole("switch", { name: "DECIMER" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("switch", { name: "DECIMER" }));
  await user.click(menu);
  expect(menu).toHaveAttribute("aria-expanded", "false");
  hold = true;
  await act(async () => {
    resolveToggle({
      ...stopped,
      power: { phase: "ready", enabled: true },
    });
  });
  await user.click(menu);
  const control = screen.getByRole("switch", { name: "DECIMER" });
  expect(control).toBeDisabled();
  expect(control).toHaveAccessibleDescription("State unavailable");
  expect(api.post).toHaveBeenCalledTimes(1);
  resolveStatus({
    ...stopped,
    power: { phase: "ready", enabled: true },
  });
  await waitFor(() => expect(control).toBeChecked());
  expect(control).toBeEnabled();
});

it("shares one explicit DECIMER toggle across the compound form and backend menu", async () => {
  const user = userEvent.setup();
  let power = { phase: "stopped", enabled: false };
  vi.mocked(request).mockImplementation(
    async (path) =>
      (path.startsWith("/utilities/recognition")
        ? { available: true, idle_power: true, power }
        : { engines: [] }) as never,
  );
  vi.mocked(api.post).mockImplementation(async (path) => {
    const enabled = path.endsWith("/start");
    power = { phase: enabled ? "ready" : "stopped", enabled };
    return { available: true, idle_power: true, power } as never;
  });
  render(
    <>
      <BackendControls language="en" onOpenRecognition={vi.fn()} />
      <ImageMoleculeInput language="en" onMolecule={vi.fn()}>
        <label>
          Compound
          <input defaultValue="Keep my draft" />
        </label>
      </ImageMoleculeInput>
    </>,
  );
  const formPower = await screen.findByRole("switch", { name: "DECIMER" });
  await waitFor(() => expect(formPower).toBeEnabled());
  expect(formPower).not.toBeChecked();
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  const menu = screen.getByRole("button", { name: "Backend controls" });
  await user.click(menu);
  const menuPower = within(
    screen.getByRole("region", { name: "Backend power" }),
  ).getByRole("switch", { name: "DECIMER" });
  expect(menuPower).toBeEnabled();
  expect(
    vi
      .mocked(request)
      .mock.calls.filter(([path]) => path.startsWith("/utilities/recognition")),
  ).toHaveLength(1);
  await user.click(menuPower);
  await waitFor(() => expect(formPower).toBeChecked());
  await user.click(formPower);
  await waitFor(() => expect(formPower).not.toBeChecked());
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(api.post).toHaveBeenLastCalledWith("/utilities/recognition/stop", {});
  expect(screen.getByRole("textbox", { name: "Compound" })).toHaveValue(
    "Keep my draft",
  );
  expect(document.querySelector("iframe")).toBeNull();
});

it.each([false, true])(
  "waits for fresh power state after leaving the editor (power request pending: %s)",
  async (changing) => {
    const user = userEvent.setup();
    const stopped = {
      available: true,
      idle_power: true,
      power: { phase: "stopped", enabled: false },
    };
    const ready = { ...stopped, power: { phase: "ready", enabled: true } };
    let resolveRead: (value: typeof ready) => void = () => {};
    const pending = new Promise<typeof ready>((resolve) => {
      resolveRead = resolve;
    });
    vi.mocked(request)
      .mockResolvedValueOnce(stopped)
      .mockReturnValueOnce(pending)
      .mockResolvedValue(stopped);
    vi.mocked(api.post).mockResolvedValue(stopped);
    let resolveChange: (value: typeof ready) => void = () => {};
    if (changing)
      vi.mocked(api.post).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveChange = resolve;
        }),
      );
    function Form() {
      const power = useRecognitionStatus(true);
      return (
        <>
          <button type="button" onClick={() => void power.refresh(true)}>
            Return from editor
          </button>
          <RecognitionBackendEntry language="en" powerControl={power} />
        </>
      );
    }
    render(<Form />);
    const toggle = screen.getByRole("switch", { name: "DECIMER" });
    await waitFor(() => expect(toggle).toBeEnabled());
    if (changing) await user.click(toggle);
    await user.click(
      screen.getByRole("button", { name: "Return from editor" }),
    );
    expect(toggle).toBeDisabled();
    if (changing) await act(async () => resolveChange(ready));
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(api.post).toHaveBeenCalledTimes(Number(changing));
    await act(async () => resolveRead(ready));
    expect(toggle).toBeEnabled();
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(api.post).toHaveBeenCalledTimes(1 + Number(changing));
    expect(api.post).toHaveBeenLastCalledWith(
      "/utilities/recognition/stop",
      {},
    );
  },
);

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
  const unavailable = screen.getByRole("switch", { name: "ADMET-AI" });
  expect(unavailable).toBeDisabled();
  expect(unavailable).toHaveAccessibleDescription("Off · Setup required");
  const setup = screen.getByRole("link", {
    name: "Set up ADMET-AI (opens in a new tab)",
  });
  expect(setup).toHaveAttribute("href", "#view=deployment");
  expect(setup).toHaveAttribute("target", "_blank");
  expect(screen.queryByRole("link", { name: /Set up RDKit/ })).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
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
it("reports persistent compute only when the module has a confirmed status", async () => {
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
  const running = {
    compute_service: { configured: true, running: true, ready: true },
  } as Deployment;
  const stopped = {
    compute_service: { configured: true, running: false, ready: false },
  } as Deployment;
  const view = (data: Deployment | null, error = "") => (
    <ComputePowerProvider data={data} error={error} refresh={vi.fn()}>
      <BackendControls
        language="en"
        module={{ label: ["生物药", "Biologics"], tools: ["fold"] }}
      />
      <BackendControls
        language="en"
        module={{ label: ["性质", "Properties"], tools: ["properties"] }}
      />
    </ComputePowerProvider>
  );
  const { rerender } = render(view(null));
  const [biologics, properties] = screen.getAllByRole("button", {
    name: "Backend controls",
  });
  await waitFor(() =>
    expect(properties).toHaveAccessibleDescription("Task engines off"),
  );
  expect(biologics).toHaveAccessibleDescription("Reading…");
  rerender(view(running));
  expect(biologics).toHaveAccessibleDescription("1 on");
  await userEvent.click(biologics);
  expect(
    screen.getByRole("switch", { name: "Persistent compute" }),
  ).toBeChecked();
  expect(
    screen.getByRole("switch", { name: "OpenDDE Harness" }),
  ).not.toBeChecked();
  rerender(view(running, "Deployment read failed"));
  expect(biologics).toHaveAccessibleDescription("State unavailable");
  expect(properties).toHaveAccessibleDescription("Task engines off");
  expect(
    screen.getByRole("switch", { name: "Persistent compute" }),
  ).toHaveAccessibleDescription("State unavailable");
  rerender(view(stopped));
  expect(biologics).toHaveAccessibleDescription("Task engines off");
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
        module={{
          label: ["分子性质", "Molecular properties"],
          tools: ["properties", "chemistry.states"],
        }}
        inlineSingle
      />
    </>,
  );
  const toggles = await screen.findAllByRole("switch", { name: "RDKit" });
  expect(toggles).toHaveLength(4);
  const moduleSwitch = within(
    screen.getByRole("group", { name: "Backend switch for this module" }),
  ).getByRole("switch");
  toggles.forEach((toggle) => expect(toggle).not.toBeChecked());
  expect(request).toHaveBeenCalledTimes(1);
  expect(api.post).not.toHaveBeenCalled();
  await user.click(moduleSwitch);
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

it("keeps the module menu and its focus target when a recovered engine appears", async () => {
  const user = userEvent.setup();
  let online = false;
  vi.mocked(request).mockImplementation(async () => {
    if (!online) throw new Error("Temporarily unavailable");
    return {
      capabilities: { properties: "chemistry" },
      engines: [entry],
    };
  });
  render(
    <BackendControls
      language="en"
      inlineSingle
      module={{
        label: ["分子性质", "Molecular properties"],
        tools: ["properties"],
      }}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Backend controls" });
  await waitFor(() =>
    expect(trigger).toHaveAccessibleDescription("State unavailable"),
  );
  await user.click(trigger);
  const retry = await screen.findByRole("button", { name: "Retry" });
  online = true;
  await user.click(retry);
  const direct = await screen.findByRole("group", {
    name: "Backend switch for this module",
  });
  expect(within(direct).getByRole("switch")).not.toBeChecked();
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(api.post).not.toHaveBeenCalled();
});

it("switches one engine at a time in the multi-engine module toolbar", async () => {
  const module = {
    label: ["性质与安全性", "Properties and safety"] as const,
    tools: ["properties", "admet.predict"] as const,
  };
  let enabled = false;
  vi.mocked(request).mockImplementation(async () => ({
    capabilities: { properties: "chemistry", "admet.predict": "admet" },
    engines: [
      { ...entry, enabled },
      { ...entry, id: "admet", name: "ADMET-AI", ready: false },
    ],
  }));
  vi.mocked(api.post).mockImplementation(async (path) => {
    enabled = path === "/runtime-controls/chemistry/start";
    return { enabled };
  });
  render(
    <>
      <BackendControls language="en" module={module} inlineSingle />
      <TaskBackendControl language="en" scope={{ capability: "properties" }} />
    </>,
  );
  const user = userEvent.setup();
  const taskSwitch = await screen.findByRole("switch", { name: "RDKit" });
  const trigger = screen.getByRole("button", { name: "Backend controls" });
  expect(trigger).toHaveAccessibleDescription("Task engines off");
  await user.click(trigger);
  const region = screen.getByRole("region", {
    name: "Backends in this module",
  });
  const panel = within(region);
  expect(
    panel.getByRole("button", { name: "Close backend panel" }),
  ).toHaveFocus();
  const chemistry = panel.getByRole("switch", { name: "RDKit" });
  const missing = panel.getByRole("switch", { name: "ADMET-AI" });
  expect(chemistry).not.toBeChecked();
  expect(missing).not.toBeChecked();
  expect(missing).toBeDisabled();
  expect(api.post).not.toHaveBeenCalled();
  await user.click(chemistry);
  await waitFor(() => expect(taskSwitch).toBeChecked());
  expect(trigger).toHaveAccessibleDescription("1 on");
  expect(missing).not.toBeChecked();
  await user.click(taskSwitch);
  expect(region).not.toBeInTheDocument();
  await waitFor(() =>
    expect(trigger).toHaveAccessibleDescription("Task engines off"),
  );
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
      <BackendControls language="en" currentCapability="fold" />
      <TaskBackendControl language="en" scope={{ capability: "properties" }} />
    </ComputePowerProvider>
  );
  const { rerender } = render(view({ compute_service: service } as Deployment));
  const task = await screen.findByRole("switch", {
    name: "Persistent compute",
  });
  expect(task).not.toBeChecked();
  expect(
    screen.getByRole("switch", { name: "OpenDDE Harness" }),
  ).not.toBeChecked();
  expect(api.post).not.toHaveBeenCalled();
  task.focus();
  await user.keyboard(" ");
  expect(task).toHaveFocus();
  expect(task).toHaveAttribute("aria-disabled", "true");
  await user.keyboard(" ");
  expect(api.post).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Backend controls" }));
  const panel = within(screen.getByRole("region", { name: "Backend power" }));
  const global = panel.getByRole("switch", { name: "Persistent compute" });
  expect(global).toHaveAttribute("aria-disabled", "true");
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
