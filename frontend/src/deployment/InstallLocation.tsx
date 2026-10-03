import { linuxLocation, type Deployment } from "./client";

const baseOf = (root?: string) =>
  root?.replace(/\/(?:x-dde|opendde)-managed$/, "");
export function InstallLocation({
  data,
  zh,
  location,
  onChange,
  busy,
  onSave,
}: {
  data: Deployment;
  zh: boolean;
  location: string;
  busy: boolean;
  onChange(value: string): void;
  onSave(): void;
}) {
  const current = baseOf(data.config.root);
  const choices = [
    ...new Set(
      [current, data.default_location, ...data.locations].filter(
        (p): p is string => !!p,
      ),
    ),
  ];
  const matched = choices.find(
    (p) => linuxLocation(p) === linuxLocation(location),
  );
  const locked =
    data.location_locked ??
    (Object.keys(data.installed).length > 0 ||
      data.operations.some((o) =>
        ["queued", "running", "pausing", "paused"].includes(o.state),
      ));
  const changed =
    !current || linuxLocation(current) !== linuxLocation(location);
  return (
    <section
      className="install-location"
      aria-label={zh ? "统一安装目录" : "Shared installation directory"}
    >
      <label className="install-location-choice">
        <strong>{zh ? "安装目录" : "Install location"}</strong>
        <select
          aria-label={zh ? "选择安装目录" : "Choose install location"}
          value={matched ?? "custom"}
          disabled={busy}
          onChange={(e) =>
            onChange(e.target.value === "custom" ? "" : e.target.value)
          }
        >
          {choices.map((path) => (
            <option key={path} value={path}>
              {path === current
                ? zh
                  ? "当前目录"
                  : "Current location"
                : path.startsWith("/mnt/e/")
                  ? zh
                    ? "E 盘目录"
                    : "E: directory"
                  : zh
                    ? "Linux 存储"
                    : "Linux storage"}{" "}
              · {path}
            </option>
          ))}
          <option value="custom">
            {zh ? "其他目录…" : "Custom location…"}
          </option>
        </select>
      </label>
      {(!matched || !location.trim()) && (
        <input
          aria-label={zh ? "自定义安装目录" : "Custom install location"}
          value={location}
          onChange={(e) => onChange(e.target.value)}
          placeholder="E:\\WSL\\apps\\x-dde"
          disabled={busy}
        />
      )}
      <button
        disabled={busy || !location.trim() || (locked && changed)}
        onClick={onSave}
      >
        {changed
          ? zh
            ? "保存目录"
            : "Save location"
          : zh
            ? "确认目录"
            : "Confirm location"}
      </button>
      {locked && changed && (
        <p className="field-help" role="status">
          {zh
            ? "已有组件使用当前目录。更换目录适用于首次安装或卸载后的重新安装，现有文件保持原位。"
            : "Existing components use the current location. Choose a new location for a fresh installation or after uninstalling; existing files stay in place."}
        </p>
      )}
    </section>
  );
}
