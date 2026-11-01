import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ProximityPlan } from "./Plan";
import { defaults } from "./generated";
import type { TernaryPayload } from "./types";
import { defaultExecution } from "./execution";
import type { Language } from "../types";
afterEach(cleanup);
function Study({ language }: { language: Language }) {
  const [payload, setPayload] = useState({
    ...defaults,
    partner_a_name: "E3 construct",
    partner_b_name: "Target construct",
  } as TernaryPayload);
  const [execution, setExecution] = useState({ ...defaultExecution });
  return (
    <>
      <ProximityPlan
        {...{ language, payload, setPayload, execution, setExecution }}
      />
      <output aria-label="Frozen choices">{JSON.stringify(payload)}</output>
    </>
  );
}
it.each(["en", "zh"] as const)(
  "changes the visible fixed protein without exchanging scientific partner identities in %s",
  async (language) => {
    render(<Study language={language} />);
    await userEvent
      .setup()
      .click(
        screen.getByText(language === "en" ? "Expert settings" : "专家微调"),
      );
    await userEvent.setup().selectOptions(
      screen.getByRole("combobox", {
        name: language === "en" ? "Fixed protein" : "固定蛋白",
      }),
      "b",
    );
    const choice = JSON.parse(
      screen.getByLabelText("Frozen choices").textContent!,
    );
    expect(choice.anchor_partner).toBe("b");
    expect(choice.partner_a_name).toBe("E3 construct");
    expect(choice.partner_b_name).toBe("Target construct");
    expect(screen.getByText("2 CPU · 4 GiB")).toBeVisible();
  },
);

it.each(["en", "zh"] as const)(
  "selects forty assemblies and returns to the default without expanding resources in %s",
  async (language) => {
    const user = userEvent.setup();
    render(<Study language={language} />);
    const choices = () =>
      JSON.parse(screen.getByLabelText("Frozen choices").textContent!);
    expect(choices().samples).toBe(3);
    await user.click(
      screen.getByRole("radio", {
        name:
          language === "en"
            ? "Detailed PROTAC exploration · 40"
            : "详细 PROTAC 探索 · 40",
      }),
    );
    expect(choices().samples).toBe(40);
    expect(choices().attempt_budget).toBe(60);
    expect(screen.getByText("2 CPU · 4 GiB")).toBeVisible();
    await user.click(
      screen.getByRole("radio", {
        name:
          language === "en"
            ? "Initial exploration · recommended"
            : "初步探索 · 推荐",
      }),
    );
    expect(choices().samples).toBe(3);
    expect(choices().attempt_budget).toBe(12);
    expect(choices().partner_a_name).toBe("E3 construct");
    expect(choices().partner_b_name).toBe("Target construct");
    expect(screen.getByText("2 CPU · 4 GiB")).toBeVisible();
  },
);
