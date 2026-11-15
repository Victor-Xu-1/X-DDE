import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import config from "../../../tests/fixtures/campaign_review/input.json";
import * as client from "../api";
import type { Language } from "../types";
import { CampaignForm } from "./CampaignForm";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each<Language>(["en", "zh"])(
  "reviews a local plan without external permission and still requires explicit launch (%s)",
  async (language) => {
    const zh = language === "zh";
    vi.spyOn(client, "request").mockResolvedValue([]);
    vi.spyOn(client.api, "assets").mockResolvedValue([]);
    const validated = {
      id: "reviewed-plan",
      digest: "a".repeat(64),
      state: "validated",
      task_id: null,
      summary: { target: config.target.name, budget: "small" },
    };
    const post = vi
      .spyOn(client.api, "post")
      .mockImplementation(
        async (path) =>
          (path.endsWith("/start")
            ? { ...validated, state: "running", task_id: "controlled-dispatch" }
            : validated) as never,
      );
    const user = userEvent.setup();
    render(<CampaignForm language={language} />);
    await user.click(
      screen.getByRole("button", {
        name: zh ? "专家参数" : "Expert parameters",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: zh ? "下一步" : "Next" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: zh ? "完整设计配置" : "Full design configuration",
      }),
      {
        target: { value: JSON.stringify(config) },
      },
    );
    await user.click(
      screen.getByRole("button", { name: zh ? "下一步" : "Next" }),
    );
    const next = screen.getByRole("button", {
      name: zh ? "下一步" : "Next",
    });
    expect(next).toBeEnabled();
    const permission = screen.getByRole("checkbox", {
      name: zh ? /允许本设计任务调用/ : /Allow this campaign/,
    });
    expect(permission).not.toBeChecked();
    await user.click(next);
    const start = () =>
      screen.getByRole("button", {
        name: zh ? "启动设计" : "Start design",
      });
    async function togglePermissionInSettings() {
      await user.click(
        screen.getByRole("button", { name: zh ? "上一步" : "Back" }),
      );
      await user.click(
        screen.getByRole("checkbox", {
          name: zh ? /允许本设计任务调用/ : /Allow this campaign/,
        }),
      );
      await user.click(
        screen.getByRole("button", { name: zh ? "下一步" : "Next" }),
      );
    }
    expect(start()).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", {
        name: zh ? "检查配置并生成任务摘要" : "Validate and review campaign",
      }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/harness/plans",
        { config },
        expect.any(String),
      ),
    );
    await user.click(
      await screen.findByRole("checkbox", {
        name: zh ? /已确认目标/ : /I have reviewed the target/,
      }),
    );
    expect(start()).toBeDisabled();
    await togglePermissionInSettings();
    expect(start()).toBeEnabled();
    expect(post).toHaveBeenCalledTimes(1);
    await togglePermissionInSettings();
    expect(start()).toBeDisabled();
    expect(post).toHaveBeenCalledTimes(1);
    await togglePermissionInSettings();
    await user.click(start());
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/harness/plans/reviewed-plan/start", {
        digest: validated.digest,
      }),
    );
    expect(
      post.mock.calls.filter(([path]) => path.endsWith("/start")),
    ).toHaveLength(1);
  },
);
