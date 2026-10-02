import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExampleActions } from "./ExampleActions";
import type { ExampleInfo } from "./types";

const transport = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({
  request: transport.request,
  api: { post: transport.post },
}));

const info: ExampleInfo = {
  module: { capability_id: "gnina.dock", case_id: "brd4-jq1", revision: 1 },
  case: {
    id: "brd4-jq1",
    revision: 1,
    label: ["BRD4–JQ1 研发案例", "BRD4–JQ1 research example"],
    description: ["公开实验复合物", "Public experimental complex"],
    sources: ["https://www.rcsb.org/structure/3MXF"],
  },
  files: [{ name: "3MXF.pdb", license: "CC0-1.0", sha256: "a".repeat(64) }],
  computed_result_available: false,
  pin: null,
};

describe("source-backed example controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transport.request.mockResolvedValue(info);
  });

  it("loads inputs without submitting a scientific task and does not invent a result", async () => {
    const onLoad = vi.fn();
    const prepared = {
      module: info.module,
      case: info.case,
      objects: {},
      sequences: {},
      sources: info.case.sources,
    };
    transport.post.mockResolvedValue(prepared);
    render(
      <ExampleActions
        capability="gnina.dock"
        language="zh"
        onLoad={onLoad}
        onResult={vi.fn()}
      />,
    );
    const load = await screen.findByRole("button", { name: "加载案例" });
    expect(screen.getByRole("button", { name: "查看真实结果" })).toBeDisabled();
    fireEvent.click(load);
    await waitFor(() => expect(onLoad).toHaveBeenCalledWith(prepared));
    expect(transport.post).toHaveBeenCalledExactlyOnceWith(
      "/examples/gnina.dock/prepare",
      {},
    );
  });

  it("opens the actual pinned native task", async () => {
    const onResult = vi.fn();
    const job = { id: "real-task", status: "succeeded" };
    transport.request
      .mockResolvedValueOnce({
        ...info,
        computed_result_available: true,
        pin: {
          job_id: "real-task",
          artifact_sha256: { "poses.sdf": "b".repeat(64) },
        },
      })
      .mockResolvedValueOnce(job);
    render(
      <ExampleActions
        capability="gnina.dock"
        language="en"
        onLoad={vi.fn()}
        onResult={onResult}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "View real results" }),
    );
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(job));
    expect(transport.request).toHaveBeenLastCalledWith("/jobs/real-task");
  });
});
