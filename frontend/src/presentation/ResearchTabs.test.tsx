import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ResearchTabs } from "./ResearchTabs";

afterEach(cleanup);
it("switches visible panels by click and keyboard while retaining an edited input", async () => {
  const user = userEvent.setup();
  render(
    <ResearchTabs
      label="Research views"
      tabs={[
        {
          id: "table",
          label: "Candidates",
          content: <input aria-label="Research note" defaultValue="" />,
        },
        { id: "structure", label: "Structure", content: <p>Structure view</p> },
      ]}
    />,
  );
  await user.type(screen.getByRole("textbox"), "Keep this candidate");
  await user.click(screen.getByRole("tab", { name: "Structure" }));
  expect(screen.getByRole("tabpanel", { name: "Structure" })).toBeVisible();
  expect(screen.queryByRole("textbox")).toBeNull();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("tab", { name: "Candidates" })).toHaveFocus();
  expect(screen.getByRole("textbox")).toHaveValue("Keep this candidate");
  await user.keyboard("{End}");
  expect(screen.getByRole("tabpanel", { name: "Structure" })).toBeVisible();
});
