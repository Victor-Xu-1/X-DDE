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
it.each(["zh", "en"] as const)(
  "previews DEL input metadata without importing assets or changing the personal draft (%s)",
  async (language) => {
    const metadata: ExampleInfo = {
      ...info,
      module: { ...info.module, capability_id: "del.library" },
      study: {
        id: "del6",
        target: "BRD4",
        organism: "Homo sapiens",
        template_kind: "research_study",
        materials: [],
        required_materials: [],
        guide: { steps: [], interpretation: ["来源明确", "Source identified"] },
      },
    };
    transport.request.mockResolvedValue(metadata);
    const onLoad = vi.fn();
    render(
      <ExampleActions
        capability="del.library"
        language={language}
        onLoad={onLoad}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: language === "zh" ? "查看研究材料" : "Preview study inputs",
      }),
    );
    expect(await screen.findByText("Verified compound output")).toBeVisible();
    expect(transport.post).not.toHaveBeenCalled();
    expect(onLoad).not.toHaveBeenCalled();
  },
);
describe("module templates", () => {
  it.each([
    { id: "different-job", status: "succeeded" },
    { id: "256b08a8-b466-47c4-a69e-32ad1d3bc9d9", status: "failed" },
  ])("rejects an unexpected or unfinished pinned job %#", async (returned) => {
    const caseId = "stat6-defined-molecules";
    transport.request
      .mockResolvedValueOnce({
        ...info,
        module: {
          capability_id: "p2rank.detect",
          case_id: caseId,
          revision: 3,
        },
        case: { ...info.case, id: caseId },
        computed_result_available: true,
        pin: {
          job_id: "256b08a8-b466-47c4-a69e-32ad1d3bc9d9",
          artifact_sha256: {
            "result.json":
              "6d1683d952f64163c752a6d5d729e7179df86e66b82a8d5b1a6b0d61c3fa8362",
          },
          review: { interpretation: "Review", limitations: "Limitations" },
        },
      })
      .mockResolvedValueOnce(returned);
    const onLoad = vi.fn();
    render(
      <ExampleActions
        capability="p2rank.detect"
        language="en"
        onLoad={onLoad}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Example results" }),
    );
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByText(/Native output/)).toBeNull();
    expect(screen.queryByText(/17 residues/)).toBeNull();
    expect(onLoad).not.toHaveBeenCalled();
  });
  it.each(["zh", "en"] as const)(
    "shows the reviewed pocket limitation alongside its exact example result (%s)",
    async (language) => {
      const caseId = "stat6-defined-molecules";
      const jobId = "256b08a8-b466-47c4-a69e-32ad1d3bc9d9";
      transport.request
        .mockResolvedValueOnce({
          ...info,
          module: {
            capability_id: "p2rank.detect",
            case_id: caseId,
            revision: 3,
          },
          case: { ...info.case, id: caseId },
          computed_result_available: true,
          pin: {
            job_id: jobId,
            artifact_sha256: {
              "result.json":
                "6d1683d952f64163c752a6d5d729e7179df86e66b82a8d5b1a6b0d61c3fa8362",
            },
            review: { interpretation: "Review", limitations: "Limitations" },
          },
        })
        .mockResolvedValueOnce({ id: jobId, status: "succeeded" });
      render(
        <ExampleActions
          capability="p2rank.detect"
          language={language}
          onLoad={vi.fn()}
        />,
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: language === "zh" ? "示例结果" : "Example results",
        }),
      );
      expect(
        await screen.findByText(
          new RegExp(language === "zh" ? "17 个接触残基" : "17 residues"),
        ),
      ).toBeVisible();
      expect(screen.getByText(`Native output ${jobId}`)).toBeVisible();
    },
  );
  it.each(["en", "zh"] as const)(
    "uses the prepared recipe guide only while its template is loaded (%s)",
    async (language) => {
      const zh = language === "zh";
      const study: NonNullable<ExampleInfo["study"]> = {
        id: "stat6",
        target: "STAT6",
        organism: "Homo sapiens",
        uniprot: "P42226",
        template_kind: "research_study",
        required_materials: [],
        guide: {
          steps: [["通用参考口袋", "Generic reference pocket"]],
          interpretation: ["计算示例", "Computational example"],
        },
      };
      const preparedStudy = {
        ...study,
        guide: {
          ...study.guide,
          steps: [["已保存的实际口袋", "Saved actual pocket"]],
        },
      };
      transport.request.mockResolvedValue({ ...info, study });
      transport.post.mockResolvedValue({
        module: info.module,
        case: info.case,
        objects: {},
        sequences: {},
        sources: info.case.sources,
        study: preparedStudy,
      });
      render(
        <ExampleActions
          capability="gnina.dock"
          language={language}
          onLoad={vi.fn()}
          onClear={vi.fn()}
        />,
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: zh ? "使用此模板" : "Use this template",
        }),
      );
      expect(
        await screen.findByText(
          zh ? "已保存的实际口袋" : "Saved actual pocket",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(zh ? "通用参考口袋" : "Generic reference pocket"),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", {
          name: zh ? "新建空白任务" : "New blank task",
        }),
      );
      expect(
        await screen.findByText(
          zh ? "通用参考口袋" : "Generic reference pocket",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(zh ? "已保存的实际口袋" : "Saved actual pocket"),
      ).not.toBeInTheDocument();
    },
  );
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
    expect(
      screen.getAllByRole("heading", { name: /BRD4–JQ1 template/ }),
    ).toHaveLength(1);
    expect(
      screen.getByText("BRD4–JQ1 template", { selector: "strong" }),
    ).not.toBeVisible();
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
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /BRD4–JQ1 template/ }),
      ).toHaveFocus(),
    );
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
    transport.request.mockResolvedValueOnce({
      ...info,
      module: { ...info.module, capability_id: "regions" },
      record_pin: {
        record_id: "retained-region",
        computed_result_available: true,
      },
    });
    transport.request.mockResolvedValueOnce({
      module: info.module,
      record: {
        kind: "regions",
        value: { id: "retained-region" },
        pin: {
          record_id: "retained-region",
          record_sha256: "a".repeat(64),
          computed_result_available: true,
        },
      },
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
    expect(transport.request).toHaveBeenLastCalledWith(
      "/examples/regions/result",
    );
    expect(transport.post).not.toHaveBeenCalled();
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
    record: {
      kind: "campaign",
      pin: {
        record_id: "setup",
        record_sha256: "a".repeat(64),
        computed_result_available: false,
      },
    },
  });
  render(
    <ExampleActions capability="gnina.dock" language="en" onLoad={vi.fn()} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Setup example" }));
  expect(await screen.findByText("Verified compound output")).toBeVisible();
  expect(screen.getByText("Setup example")).toBeVisible();
  expect(screen.queryByText("Public example")).toBeNull();
});

it.each(["en", "zh"] as const)(
  "shows a record's review and retained native stages in %s without changing the task draft",
  async (language) => {
    const review = {
      scope: "reviewed_computational_example" as const,
      interpretation:
        "Protocol record review retains the original result and its independent quality stage.",
      limitations:
        "This UI fixture does not establish experimental binding, affinity or selectivity.",
      checked: [
        "input_identity",
        "method_scope",
        "native_outputs",
        "visual_preview",
        "downloads",
      ],
    };
    const pin = {
      record_id: "reviewed-record",
      record_sha256: "a".repeat(64),
      computed_result_available: true,
      review,
      supporting_evidence: [
        {
          job_id: "retained-quality",
          artifact_sha256: { "result.json": "b".repeat(64) },
        },
      ],
    };
    transport.request.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/jobs/retained-quality"
          ? {
              id: "retained-quality",
              status: "succeeded",
              request: {
                operation: "pose_quality",
                name: "Retained independent pose review",
              },
            }
          : path === "/examples/regions/result"
            ? {
                module: { ...info.module, capability_id: "regions" },
                record: { kind: "regions", value: { id: pin.record_id }, pin },
              }
            : {
                ...info,
                module: { ...info.module, capability_id: "regions" },
                computed_result_available: true,
                record_pin: pin,
              },
      ),
    );
    const onLoad = vi.fn();
    render(
      <ExampleActions
        capability="regions"
        language={language}
        onLoad={onLoad}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: language === "zh" ? "示例结果" : "Example results",
      }),
    );
    expect(await screen.findByText("Verified compound output")).toBeVisible();
    fireEvent.click(
      screen.getByText(
        language === "zh"
          ? "示例结果的解读与适用范围"
          : "Example interpretation and scope",
        { exact: true },
      ),
    );
    expect(screen.getByText(review.interpretation)).toBeVisible();
    expect(screen.getByText(review.limitations)).toBeVisible();
    const stage = screen.getByRole("combobox", {
      name: language === "zh" ? "研究阶段结果" : "Study result stage",
    });
    const primary = (stage as HTMLSelectElement).value;
    fireEvent.change(stage, { target: { value: "retained-quality" } });
    expect(
      await screen.findByText("Native output retained-quality"),
    ).toBeVisible();
    expect(screen.getByText("Verified compound output")).not.toBeVisible();
    fireEvent.change(stage, { target: { value: primary } });
    expect(screen.getByText("Verified compound output")).toBeVisible();
    expect(onLoad).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
  },
);

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
