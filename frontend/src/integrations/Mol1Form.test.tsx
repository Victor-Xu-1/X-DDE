import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
  vi.restoreAllMocks();
});

beforeEach(() => {
  const proto = HTMLDialogElement.prototype;
  if (!proto.showModal) {
    Object.defineProperties(proto, {
      showModal: {
        configurable: true,
        value() {
          this.setAttribute("open", "");
        },
      },
      close: {
        configurable: true,
        value() {
          this.removeAttribute("open");
        },
      },
    });
  }
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
        name: zh ? "预览任务" : "Preview job",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: zh ? "预览任务" : "Preview job",
    });
    const review = within(dialog);
    expect(api.submit).not.toHaveBeenCalled();
    await user.click(
      await review.findByRole("button", {
        name: zh ? "提交内容" : "Request JSON",
      }),
    );
    const shown = JSON.parse(
      review.getByLabelText(zh ? "X-DDE 提交请求" : "X-DDE submission request")
        .textContent!,
    );
    await user.click(
      review.getByRole("button", {
        name: zh ? "提交任务" : "Submit job",
      }),
    );
    await waitFor(() => expect(api.submit).toHaveBeenCalledOnce());
    const body = vi.mocked(api.submit).mock.calls[0][0];
    expect(body).toEqual(shown);
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
