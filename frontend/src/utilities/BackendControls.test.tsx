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
  render(<BackendControls data={null} language="en" refresh={vi.fn()} />);
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
it("keeps failed changes off and prevents stopping active tasks", async () => {
  vi.mocked(request).mockResolvedValue({ engines: [entry] });
  vi.mocked(api.post).mockRejectedValue(new Error("conflict"));
  render(<BackendControls data={null} language="en" refresh={vi.fn()} />);
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
  render(<BackendControls data={null} language="en" refresh={vi.fn()} />);
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
      <BackendControls data={null} language="en" refresh={vi.fn()} />
    </>,
  );
  const toggles = await screen.findAllByRole("switch", { name: "RDKit" });
  expect(toggles).toHaveLength(3);
  toggles.forEach((toggle) => expect(toggle).not.toBeChecked());
  expect(request).toHaveBeenCalledTimes(1);
  expect(api.post).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Backend controls" }));
  const global = within(screen.getByRole("region", { name: "Backend power" }));
  expect(global.getByRole("switch", { name: "RDKit" })).not.toBeChecked();
  await user.click(toggles[0]);
  await waitFor(() =>
    expect(global.getByRole("switch", { name: "RDKit" })).toBeChecked(),
  );
  toggles.forEach((toggle) => expect(toggle).toBeChecked());
  await user.click(global.getByRole("switch", { name: "RDKit" }));
  await waitFor(() => expect(toggles[0]).not.toBeChecked());
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
