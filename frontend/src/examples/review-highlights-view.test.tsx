import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ExampleActions } from "./ExampleActions";

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
vi.mock("./ExampleRecordResult", () => ({ ExampleRecordResult: () => null }));

const jobId = "cf623a70-e687-47d1-9727-4433dc6429b5";
// Captured from the installed public case; the native result was independently
// downloaded and its SHA-256 computed before updating this regression fixture.
const actualCase = {
  module: {
    capability_id: "gnina.dock",
    case_id: "stat6-defined-molecules",
    revision: 5,
  },
  case: {
    id: "stat6-defined-molecules",
    revision: 2,
    label: ["STAT6", "STAT6"],
    description: ["案例", "Example"],
    sources: [],
  },
  files: [],
  computed_result_available: true,
  pin: {
    job_id: jobId,
    artifact_sha256: {
      "result.json":
        "a0cd9fe2e3405f1aea4094fd3e683bb91c3c032b355e334fce56049c3e1bdf3b",
    },
    review: { interpretation: "Review", limitations: "Limitations" },
    supporting_evidence: [
      {
        job_id: "8969b071-879b-4374-9044-f9108ba29588",
        artifact_sha256: {
          "result.json":
            "b2ddd68b1d5c298a1850080ac41bfc5a7a94202b294dc41600e85c5e665521df",
        },
      },
      {
        job_id: "ca498efb-cb18-40ca-9262-c2597ab422da",
        artifact_sha256: {
          "result.json":
            "639c5abca478299a191aa45a0b21880ec1d3c083cb41aca2caadeed22b306e8d",
        },
      },
    ],
  },
};
beforeEach(() => {
  transport.request.mockReset();
  transport.post.mockReset();
});
it.each(["zh", "en"] as const)(
  "shows the actual STAT6 docking review before expanding details (%s)",
  async (language) => {
    transport.request
      .mockResolvedValueOnce(actualCase)
      .mockResolvedValueOnce({
        id: jobId,
        status: "succeeded",
        request: { operation: "docking" },
      });
    render(
      <ExampleActions
        capability="gnina.dock"
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
        new RegExp(
          language === "zh"
            ? "默认姿势 1 尚无对应质控"
            : "default pose 1 has none",
        ),
      ),
    ).toBeVisible();
    expect(screen.getByText(`Native output ${jobId}`)).toBeVisible();
    expect(transport.post).not.toHaveBeenCalled();
  },
);
