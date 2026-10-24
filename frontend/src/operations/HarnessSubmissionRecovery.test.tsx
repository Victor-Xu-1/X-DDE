import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { HarnessForm } from "./HarnessForm";
import type { Job } from "../types";
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("./useHarnessSources", () => ({
  useHarnessSources: () => ({
    ready: true,
    loading: false,
    error: "",
    assets: [],
    references: [],
    retry: vi.fn(),
  }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each(["en", "zh"] as const)(
  "requires a valid task name and clears a corrected server rejection before the next review in %s",
  async (language) => {
    const user = userEvent.setup(),
      created = vi.fn();
    const send = vi
      .spyOn(api, "submit")
      .mockRejectedValueOnce(new Error("Server rejected previous name"))
      .mockResolvedValue({ id: "real-accepted-job" } as Job);
    render(<HarnessForm tool="esm" language={language} onCreated={created} />);
    await user.click(
      screen.getByRole("button", {
        name: language === "zh" ? "专家模式" : "Expert mode",
      }),
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name:
          language === "zh"
            ? "完整原生科学参数"
            : "Full native scientific parameters",
      }),
      {
        target: {
          value: JSON.stringify({ sequences: ["ACDEFGHIKLMNPQRSTVWY"] }),
        },
      },
    );
    const next = () =>
      screen.getByRole("button", {
        name: language === "zh" ? "下一步" : "Next",
      });
    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
    await user.click(next());
    const name = screen.getByRole("textbox", {
      name: language === "zh" ? "任务名称（可选）" : "Task name (optional)",
    });
    expect(name).toHaveAttribute("maxlength", "80");
    fireEvent.change(name, { target: { value: "x".repeat(81) } });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(next()).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: "First valid name" } });
    await user.click(next());
    await user.click(
      screen.getByRole("button", {
        name: language === "zh" ? "提交计算任务" : "Submit compute task",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Server rejected previous name",
    );
    await user.click(
      screen.getByRole("button", {
        name: language === "zh" ? "上一步" : "Back",
      }),
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: language === "zh" ? "任务名称（可选）" : "Task name (optional)",
      }),
      { target: { value: "Corrected valid name" } },
    );
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(next());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByText("Corrected valid name", { selector: "dd" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: language === "zh" ? "提交计算任务" : "Submit compute task",
      }),
    );
    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({
      name: "Corrected valid name",
      payload: { sequences: ["ACDEFGHIKLMNPQRSTVWY"] },
    });
  },
);
