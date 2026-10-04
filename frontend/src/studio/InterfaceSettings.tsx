import type { Language } from "../types";
import { THEMES, useTheme } from "../theme";

export function InterfaceSettings({
  language,
  onLanguage,
  storageWarning,
}: {
  language: Language;
  onLanguage(value: Language): void;
  storageWarning: boolean;
}) {
  const zh = language === "zh";
  const { theme, setTheme, storageWarning: themeStorageWarning } = useTheme();
  const themeLabels = {
    light: {
      name: zh ? "浅色" : "Light",
      description: zh
        ? "浅灰背景与白色工作区，默认主题"
        : "Light gray canvas and white workspaces · Default",
    },
    dark: {
      name: zh ? "深色" : "Dark",
      description: zh
        ? "深色背景，适合暗光环境"
        : "Dark surfaces for low light",
    },
  };
  return (
    <section className="utility-page account-settings">
      <div className="management-heading">
        <h1 className="sr-only">
          {zh ? "界面设置" : "Appearance and language"}
        </h1>
      </div>
      <div className="management-card">
        <h2>{zh ? "界面偏好" : "Interface preferences"}</h2>
        <fieldset
          className="theme-preference"
          aria-describedby="theme-description"
        >
          <legend>{zh ? "外观主题" : "Appearance"}</legend>
          <p id="theme-description" className="theme-description">
            {zh
              ? "即时应用于整个工作台，并在此浏览器中保存。"
              : "Applies immediately throughout the workbench and is saved in this browser."}
          </p>
          <div className="theme-options">
            {THEMES.map((value) => (
              <label
                key={value}
                className={`theme-option${theme === value ? " theme-option-selected" : ""}`}
                data-theme-preview={value}
              >
                <input
                  type="radio"
                  name="appearance-theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => setTheme(value)}
                  aria-label={themeLabels[value].name}
                  aria-describedby={`theme-description-${value}`}
                />
                <span className="theme-swatch" aria-hidden="true">
                  <span className="theme-swatch-sidebar" />
                  <span className="theme-swatch-content">
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
                <strong>{themeLabels[value].name}</strong>
                <small id={`theme-description-${value}`}>
                  {themeLabels[value].description}
                </small>
              </label>
            ))}
          </div>
          {themeStorageWarning && (
            <p className="preference-warning" role="status">
              {zh
                ? "浏览器无法保存主题偏好。当前页面仍可切换；刷新后可能无法保留当前主题。"
                : "This browser cannot save your theme preference. You can still switch themes here; your current choice may not survive a reload."}
            </p>
          )}
        </fieldset>
        <label className="preference-row" htmlFor="settings-language">
          <span>
            <strong>{zh ? "界面语言" : "Interface language"}</strong>
            <small>
              {zh
                ? "应用于整个工作台，并在此浏览器中保存。"
                : "Applies throughout the workbench and is saved in this browser."}
            </small>
          </span>
          <select
            id="settings-language"
            value={language}
            onChange={(event) => onLanguage(event.target.value as Language)}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        {storageWarning && (
          <p role="status">
            {zh
              ? "浏览器无法记住语言选择"
              : "Language preference could not be saved."}
          </p>
        )}
      </div>
    </section>
  );
}
