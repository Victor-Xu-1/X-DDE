import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { api } from "../api";
import { defaultOptions } from "../viewer/protocol";
import { CoreVerification } from "./CoreVerification";
import type { CoreVerificationData } from "./types";

const data: CoreVerificationData = {
  method: "rdkit_fixed_core_v1",
  preserve_bonds: true,
  qualified_count: 1,
  qualified_sha256: "a".repeat(64),
  candidates: [
    {
      record: 0,
      qualified_record: 0,
      diagnostic_artifact: null,
      status: "passed",
      reason: null,
      maximum_displacement: 0.02,
      mapping: [{ source_atom: 0, output_atom: 2 }],
    },
    {
      record: 1,
      qualified_record: null,
      diagnostic_artifact: "diagnostic-core-002.sdf",
      status: "indeterminate",
      reason: "stereo_crosses_fixed_boundary",
      maximum_displacement: null,
      mapping: [],
    },
  ],
};
it("explains independent qualification and exact mapping with diagnostic-only uncertainty", async () => {
  render(<CoreVerification data={data} jobId="job" language="zh" />);
  const user = userEvent.setup();
  await user.click(screen.getByText(/固定区域独立复核/));
  expect(screen.getByText(/候选 1 · 通过/)).toBeVisible();
  expect(screen.getByText(/候选 2 · 无法确认/)).toBeVisible();
  expect(screen.getByText(/请扩大固定区域/)).toBeVisible();
  await user.click(screen.getByText("查看已验证原子映射"));
  expect(screen.getByText("0 → 2")).toBeVisible();
  expect(screen.queryByRole("button", { name: /复用/ })).toBeNull();
});
it("does not claim bond preservation in atom-only mode and handles empty results", async () => {
  render(
    <CoreVerification
      data={{
        ...data,
        preserve_bonds: false,
        qualified_count: 0,
        candidates: [],
      }}
      jobId="job"
      language="en"
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByText(/Independent fixed-core verification/));
  expect(
    screen.getByText(/not proof of a preserved chemical core/),
  ).toBeVisible();
  expect(screen.getByText(/no candidate to verify/)).toBeVisible();
});

it("explains rejected attachment sites and does not label the product reusable", async () => {
  render(
    <CoreVerification
      data={{
        ...data,
        method: "rdkit_fixed_core_attachments_v2",
        attachment_policy: "original_cuts",
        qualified_count: 0,
        candidates: [
          {
            ...data.candidates[1],
            status: "failed",
            reason: "unexpected_core_attachment",
          },
        ],
      }}
      jobId="job"
      language="en"
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByText(/Independent fixed-core verification/));
  expect(screen.getByText(/original cut sites only/)).toBeVisible();
  expect(screen.getByText(/outside the allowed core sites/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /reuse/i })).toBeNull();
});

it("opens rejected diagnostic coordinates without requesting candidate reuse or pose preparation", async () => {
  const submit = vi.spyOn(api, "post");
  const jobId = "7b9bd02b-0b93-45f4-a8b9-80e1cff203c9";
  render(
    <CoreVerification
      data={{ ...data, qualified_count: 0, candidates: [data.candidates[1]] }}
      jobId={jobId}
      language="en"
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByText(/Independent fixed-core verification/));
  await user.click(screen.getByText("Inspect diagnostic structure"));
  const frame = screen.getByTitle(
    "Interactive molecular structure",
  ) as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  const message = (type: string, detail?: unknown) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: location.origin,
          source: frame.contentWindow,
          data: { channel: "opendde-viewer", type, detail },
        }),
      );
    });
  message("ready");
  const input = post.mock.calls.find(([value]) => value.type === "load")?.[0]
    .value;
  expect(input).toMatchObject({
    urls: [`/api/jobs/${jobId}/download?name=diagnostic-core-002.sdf`],
    initialPosePrepared: true,
  });
  message("loaded", {
    ...defaultOptions,
    atoms: 30,
    chains: [],
    ligands: [],
    residues: [],
    hasPolymer: false,
    options: defaultOptions,
  });
  expect(screen.getByRole("button", { name: "Capture 3D view" })).toBeEnabled();
  message("initial-pose-required");
  expect(submit).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Pose optimization and history")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Download diagnostic SDF" }),
  ).toHaveAttribute(
    "href",
    `/api/jobs/${jobId}/download?name=diagnostic-core-002.sdf`,
  );
  expect(screen.queryByRole("button", { name: /reuse/i })).toBeNull();
  submit.mockRestore();
});
