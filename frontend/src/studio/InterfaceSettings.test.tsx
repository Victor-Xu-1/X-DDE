import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setTheme, THEME_STORAGE_KEY } from "../theme";
import { InterfaceSettings } from "./InterfaceSettings";

beforeEach(() => {
  localStorage.clear();
  setTheme("light");
});

afterEach(() => vi.restoreAllMocks());

it("offers two accessible themes and supports keyboard switching", async () => {
  const user = userEvent.setup();
  render(
    <InterfaceSettings
      language="en"
      onLanguage={() => {}}
      storageWarning={false}
    />,
  );
  expect(screen.getByRole("group", { name: "Appearance" })).toBeVisible();
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
  const night = screen.getByRole("radio", { name: "Dark" });
  await user.click(night);
  expect(night).toBeChecked();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
});

it("provides the theme names and descriptions in Chinese", () => {
  render(
    <InterfaceSettings
      language="zh"
      onLanguage={() => {}}
      storageWarning={false}
    />,
  );
  expect(screen.getByRole("group", { name: "外观主题" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "浅色" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "浅色" })).toBeVisible();
  expect(
    screen.getByRole("radio", { name: "深色" }),
  ).toHaveAccessibleDescription("深色背景，适合暗光环境");
});

it("explains failed persistence while continuing to apply the selected theme", async () => {
  const user = userEvent.setup();
  render(
    <InterfaceSettings
      language="en"
      onLanguage={() => {}}
      storageWarning={false}
    />,
  );
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage is disabled", "SecurityError");
  });
  await user.click(screen.getByRole("radio", { name: "Dark" }));
  expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.getByRole("status")).toHaveTextContent(
    "This browser cannot save your theme preference",
  );
});
