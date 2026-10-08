import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExampleActions } from "./ExampleActions";
import type { ExampleInfo } from "./types";
const transport = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({
  request: transport.request,
  api: { post: transport.post },
}));
vi.mock("./ExampleJobResult", () => ({
  ExampleJobResult: ({ job }: { job: { id: string } }) => (
    <p>Native output {job.id}</p>
  ),
}));
vi.mock("./ExampleRecordResult", () => ({
  ExampleRecordResult: () => <p>Verified compound output</p>,
}));
const info: ExampleInfo = {
  module: { capability_id: "gnina.dock", case_id: "brd4-jq1", revision: 1 },
  case: {
    id: "brd4-jq1",
    revision: 1,
    label: ["BRD4–JQ1 研发模板", "BRD4–JQ1 template"],
    description: ["公开实验复合物", "Public experimental complex"],
    sources: ["https://www.rcsb.org/structure/3MXF"],
  },
  files: [{ name: "3MXF.pdb", license: "CC0-1.0", sha256: "a".repeat(64) }],
  computed_result_available: false,
  pin: null,
};
beforeEach(() => {
  transport.request.mockReset().mockResolvedValue(info);
  transport.post.mockReset();
});
describe("module templates", () => {
  it("starts blank and loads a template only by explicit choice without submitting", async () => {
    const onLoad = vi.fn(),
      prepared = {
        module: info.module,
        case: info.case,
        objects: {},
        sequences: {},
        sources: info.case.sources,
        request: { name: "Template", project_id: "public-example-project" },
      };
    transport.post.mockResolvedValue(prepared);
    render(
      <ExampleActions capability="gnina.dock" language="zh" onLoad={onLoad} />,
    );
    const load = await screen.findByRole("button", { name: "使用此模板" });
    expect(onLoad).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "示例结果" })).toBeNull();
    fireEvent.click(load);
    await waitFor(() =>
      expect(onLoad).toHaveBeenCalledWith({
        ...prepared,
        template_active: true,
        request: { ...prepared.request, project_id: null },
      }),
    );
    expect(transport.post).toHaveBeenCalledExactlyOnceWith(
      "/examples/gnina.dock/prepare",
      {},
    );
  });
  it("shows pinned native results inside the module and preserves the current task URL", async () => {
    const onLoad = vi.fn(),
      onPreviewChange = vi.fn(),
      url = location.href;
    transport.request
      .mockResolvedValueOnce({
        ...info,
        computed_result_available: true,
        pin: {
          job_id: "native-task",
          artifact_sha256: { "poses.sdf": "b".repeat(64) },
        },
      })
      .mockResolvedValueOnce({ id: "native-task", status: "succeeded" });
    render(
      <ExampleActions
        capability="gnina.dock"
        language="en"
        onLoad={onLoad}
        onPreviewChange={onPreviewChange}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Example results" }),
    );
    expect(await screen.findByText("Native output native-task")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: /BRD4–JQ1 template/ }),
    ).toBeVisible();
    expect(screen.getByText("Public example")).toBeVisible();
    expect(screen.getAllByText(/BRD4–JQ1 template/)).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "In-module example results" }),
    ).toBeVisible();
    expect(onLoad).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
    expect(location.href).toBe(url);
    expect(onPreviewChange).toHaveBeenLastCalledWith(true);
    expect(
      screen.queryByRole("button", { name: "Example results" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: /BRD4–JQ1 template/ }),
    ).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { name: "Return to task form" }),
    );
    expect(onPreviewChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText("Native output native-task")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Example results" }),
    ).toHaveFocus();
  });
  it("opens a verified compound result without loading it into a live plan", async () => {
    transport.request.mockResolvedValue({
      ...info,
      module: { ...info.module, capability_id: "regions" },
      record_pin: {
        record_id: "retained-region",
        computed_result_available: true,
      },
    });
    transport.post.mockResolvedValue({
      module: info.module,
      record: { kind: "regions", value: { id: "retained-region" } },
    });
    const onLoad = vi.fn();
    render(
      <ExampleActions capability="regions" language="en" onLoad={onLoad} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Example results" }),
    );
    expect(await screen.findByText("Verified compound output")).toBeVisible();
    expect(onLoad).not.toHaveBeenCalled();
    expect(transport.post).toHaveBeenCalledExactlyOnceWith(
      "/examples/regions/prepare",
      {},
    );
  });
  it("lets the user explicitly return to a new blank task", async () => {
    transport.post.mockResolvedValue({ module: info.module, case: info.case });
    const clear = vi.fn();
    render(
      <ExampleActions
        capability="gnina.dock"
        language="en"
        onLoad={vi.fn()}
        onClear={clear}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Use this template" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "New blank task" }),
    );
    expect(clear).toHaveBeenCalledOnce();
  });
  it("keeps a malformed template from breaking the task form", async () => {
    transport.request.mockResolvedValue([]);
    render(
      <ExampleActions capability="gnina.dock" language="en" onLoad={vi.fn()} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Example guide unavailable",
    );
    expect(
      screen.queryByRole("button", { name: "Use this template" }),
    ).toBeNull();
  });
});

it("shows metadata loading and lets the researcher retry without changing inputs", async () => {
  let reject: (value: Error) => void = () => {};
  transport.request.mockReturnValueOnce(
    new Promise((_resolve, failure) => {
      reject = failure;
    }),
  );
  const onLoad = vi.fn();
  const { rerender } = render(
    <ExampleActions capability="gnina.dock" language="en" onLoad={onLoad} />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading example");
  await act(async () =>
    reject(new Error("ConnectionRefused: /srv/private/runtime.log")),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Example guide unavailable",
  );
  expect(screen.queryByText(/runtime.log|ConnectionRefused/)).toBeNull();
  rerender(
    <ExampleActions capability="gnina.dock" language="zh" onLoad={onLoad} />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("案例说明暂不可用");
  transport.request.mockResolvedValueOnce(info);
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(
    await screen.findByRole("button", { name: "使用此模板" }),
  ).toBeEnabled();
  expect(onLoad).not.toHaveBeenCalled();
  expect(transport.post).not.toHaveBeenCalled();
});

it("names result loading correctly and retries the same public result without preparing inputs", async () => {
  let reject: (value: Error) => void = () => {};
  transport.request.mockResolvedValueOnce({
    ...info,
    pin: { job_id: "native-task", artifact_sha256: {} },
    computed_result_available: true,
  });
  transport.request.mockReturnValueOnce(
    new Promise((_resolve, failure) => {
      reject = failure;
    }),
  );
  const onLoad = vi.fn();
  render(
    <ExampleActions capability="gnina.dock" language="en" onLoad={onLoad} />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Example results" }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Opening example");
  expect(
    screen.getByRole("button", { name: "Opening example…" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Use this template" }),
  ).toBeDisabled();
  await act(async () => reject(new Error("Failed to fetch")));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Example results unavailable");
  transport.request.mockResolvedValueOnce({
    id: "native-task",
    status: "succeeded",
  });
  fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Native output native-task")).toBeVisible();
  expect(transport.request).toHaveBeenLastCalledWith("/jobs/native-task");
  expect(onLoad).not.toHaveBeenCalled();
  expect(transport.post).not.toHaveBeenCalled();
});

it("preserves setup-only provenance when presenting a record without computed output", async () => {
  transport.request.mockResolvedValueOnce({
    ...info,
    record_pin: { record_id: "setup", computed_result_available: false },
  });
  transport.post.mockResolvedValueOnce({
    module: info.module,
    record: { kind: "campaign" },
  });
  render(
    <ExampleActions capability="gnina.dock" language="en" onLoad={vi.fn()} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Setup example" }));
  expect(await screen.findByText("Verified compound output")).toBeVisible();
  expect(screen.getByText("Setup example")).toBeVisible();
  expect(screen.queryByText("Public example")).toBeNull();
});

it("ignores a template response after the user changes modules", async () => {
  let resolve: (value: unknown) => void = () => {};
  transport.request.mockResolvedValue(info);
  transport.post.mockReturnValue(new Promise((value) => (resolve = value)));
  const onLoad = vi.fn(),
    preview = vi.fn();
  const { rerender } = render(
    <ExampleActions
      capability="gnina.dock"
      language="en"
      onLoad={onLoad}
      onPreviewChange={preview}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Use this template" }),
  );
  transport.request.mockResolvedValue({
    ...info,
    module: { ...info.module, capability_id: "properties" },
  });
  rerender(
    <ExampleActions
      capability="properties"
      language="en"
      onLoad={onLoad}
      onPreviewChange={preview}
    />,
  );
  resolve({ module: info.module, case: info.case });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Use this template" }),
    ).toBeEnabled(),
  );
  expect(onLoad).not.toHaveBeenCalled();
  expect(preview).not.toHaveBeenCalledWith(true);
});
