import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import type { Job } from "../types";
import type { Asset } from "./types";
import { HarnessForm } from "./HarnessForm";
import { HarnessReview } from "./HarnessReview";
import { canGuide } from "./guided-contract";
import {
  harnessInputsComplete,
  harnessMaterialsComplete,
} from "./harness-questionnaire-model";

const asset: Asset = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "target-native-alignment.a3m",
  kind: "msa",
  suffix: ".a3m",
  size: 90540,
  sha256: "b".repeat(64),
  created_at: "2026-10-24",
};
const nativeInput = () => ({
  candidates: [
    {
      candidate_id: "deposited-Fv-control",
      chains: { H: "EVQLVESGG", L: "DIVMTQSP" },
    },
  ],
  options: {
    target_chains: {
      T: {
        sequence: "MKVLQEPTCVSDYMSISTCEWK",
        unpairedMsaPath: `asset:${asset.id}`,
      },
    },
    target_chain_ids: ["T"],
    binder_chain_ids: ["H", "L"],
    use_msa: true,
    enable_msa_search: false,
    seeds: [42],
    recycling_cycles: 10,
    diffusion_samples: 1,
    diffusion_steps: 200,
  },
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("accepts native target-chain MSA objects without stripping scientific inputs or offering a lossy guided conversion", () => {
  const payload = nativeInput(),
    before = JSON.stringify(payload);
  expect(harnessInputsComplete("fold", payload)).toBe(true);
  expect(harnessMaterialsComplete("fold", payload)).toBe(true);
  expect(canGuide("fold", payload)).toBe(false);
  expect(JSON.stringify(payload)).toBe(before);
});

it.each([
  null,
  {},
  { T: "" },
  { T: { sequence: " " } },
  { T: { sequence: 21 } },
  { T: ["MKVL"] },
  { T: "MKVL", X: {} },
])(
  "does not admit empty, malformed or partially valid native chains: %j",
  (target_chains) => {
    const payload = {
      ...nativeInput(),
      options: { ...nativeInput().options, target_chains },
    };
    expect(harnessInputsComplete("fold", payload)).toBe(false);
    expect(harnessMaterialsComplete("fold", payload)).toBe(false);
  },
);

it("also retains per-chain alignments on a native candidate", () => {
  const payload = nativeInput();
  const candidate = {
    candidate_id: "candidate",
    chains: {
      H: { sequence: "EVQLVESGG", unpairedMsaPath: `asset:${asset.id}` },
    },
  };
  expect(
    harnessInputsComplete("fold", { ...payload, candidates: [candidate] }),
  ).toBe(true);
});

it.each(["en", "zh"] as const)(
  "reviews actual target/candidate lengths and native MSA/sampling in %s",
  (language) => {
    render(
      <HarnessReview
        tool="fold"
        payload={nativeInput()}
        assets={[asset]}
        name="Matched control"
        expert
        external
        language={language}
      />,
    );
    expect(
      screen.getByRole("table", {
        name: language === "zh" ? "目标蛋白" : "Target protein",
      }),
    ).toHaveTextContent("T");
    expect(
      screen.getByRole("table", {
        name: language === "zh" ? "目标蛋白" : "Target protein",
      }),
    ).toHaveTextContent("22");
    expect(screen.getByText("deposited-Fv-control")).toBeVisible();
    expect(
      screen.getByText(
        language === "zh" ? "MSA 文件已选" : "MSA file selected",
      ),
    ).toBeVisible();
    expect(screen.getByText(/200/)).toBeVisible();
    expect(screen.getByText(/42/)).toBeVisible();
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
    expect(screen.queryByText(asset.id)).toBeNull();
  },
);

it("makes ignored alignment files explicit instead of claiming they are used", () => {
  const payload = nativeInput();
  payload.options.use_msa = false;
  render(
    <HarnessReview
      tool="fold"
      payload={payload}
      assets={[asset]}
      name=""
      expert
      external
      language="en"
    />,
  );
  expect(screen.getByText(/Supplied MSA files will not be used/)).toBeVisible();
  expect(screen.queryByText("MSA file selected")).toBeNull();
});

it("does not label a search-disabled query-only chain as an alignment-supported prediction", () => {
  const payload = {
    ...nativeInput(),
    options: {
      ...nativeInput().options,
      target_chains: { T: "MKVLQEPTCVSDYMSISTCEWK" },
    },
  };
  render(
    <HarnessReview
      tool="fold"
      payload={payload}
      assets={[]}
      name=""
      expert
      external
      language="en"
    />,
  );
  expect(
    screen.getAllByText("No supplied MSA; search disabled").length,
  ).toBeGreaterThan(0);
});

it("preserves MSA references and expert fields through every step and only submits after the reviewed external-service choice", async () => {
  vi.spyOn(client, "request").mockImplementation(
    async (path) =>
      (path.startsWith("/capabilities/")
        ? { availability: { configuration_present: true } }
        : path.endsWith("/metadata")
          ? asset
          : []) as never,
  );
  const submit = vi
    .spyOn(client.api, "submit")
    .mockResolvedValue({ id: "native-fold" } as Job);
  const payload = nativeInput(),
    frozen = JSON.stringify(payload),
    user = userEvent.setup();
  render(<HarnessForm tool="fold" language="en" onCreated={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Expert mode" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Full native scientific parameters" }),
    { target: { value: JSON.stringify(payload) } },
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Guided mode" }));
  expect(
    screen.getByRole("textbox", { name: "Full native scientific parameters" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", { name: /Allow sending this sequence/ }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("table", { name: "Target protein" }),
  ).toHaveTextContent("22");
  expect(submit).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Submit compute task" }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Submit compute task" }));
  expect(submit.mock.calls[0][0]).toMatchObject({
    operation: "harness",
    tool: "fold",
    payload,
    allow_external: true,
    scientific_inputs: [
      { asset_id: asset.id, sha256: asset.sha256, record: 0, conformer: 0 },
    ],
  });
  expect(JSON.stringify(payload)).toBe(frozen);
});
