import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { Mol1Form } from "./Mol1Form";

vi.mock("../api", async () => {
  const real = await vi.importActual<typeof import("../api")>("../api");
  return { ...real, api: { ...real.api, submit: vi.fn() } };
});
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("../presentation/MoleculeImage", () => ({ MoleculeImage: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each(["en", "zh"] as const)(
  "keeps one step visible and submits the actual Mol-1 controls in %s",
  async (language) => {
    const zh = language === "zh";
    vi.mocked(api.submit).mockRejectedValue(
      new Error("Captured engineering request"),
    );
    const user = userEvent.setup();
    render(<Mol1Form language={language} onCreated={vi.fn()} />);
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "PREACHINGS");
    await user.type(inputs[1], "CCD_ATP");
    expect(
      screen.queryByLabelText(
        zh ? "序列进化信息" : "Sequence evolutionary information",
      ),
    ).not.toBeVisible();
    await user.click(
      screen.getByRole("button", { name: zh ? "下一步" : "Next" }),
    );
    expect(
      screen.getByRole("button", { name: zh ? "下一步" : "Next" }),
    ).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText(
        zh ? "序列进化信息" : "Sequence evolutionary information",
      ),
      "none",
    );
    await user.click(
      screen.getByRole("button", { name: zh ? "下一步" : "Next" }),
    );
    expect(
      screen.queryByLabelText(
        zh ? "序列进化信息" : "Sequence evolutionary information",
      ),
    ).not.toBeVisible();
    await user.click(
      screen.getByRole("button", { name: zh ? "下一步" : "Next" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: zh ? "提交 Mol-1 预测" : "Submit Mol-1 prediction",
      }),
    );
    await waitFor(() => expect(api.submit).toHaveBeenCalledOnce());
    const body = vi.mocked(api.submit).mock.calls[0][0];
    expect(body).toMatchObject({
      operation: "mol1_predict",
      payload: {
        kind: "mol1",
        samples: 5,
        cycles: 20,
        steps: 200,
        feature_mode: "none",
        allow_network: false,
        components: [
          { kind: "protein", value: "PREACHINGS" },
          { kind: "ligand", value: "CCD_ATP" },
        ],
      },
      options: { device: "cuda", memory_mib: 32768, seed: 101 },
    });
  },
);
