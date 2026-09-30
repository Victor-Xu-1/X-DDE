import type { Language } from "../types";
import { roles } from "./generated";
import type { Region, RegionRole } from "./model";
export function RegionDrafts({
  values,
  active,
  onActive,
  onChange,
  language,
}: {
  values: Region[];
  active: number;
  onActive(index: number): void;
  onChange(values: Region[]): void;
  language: Language;
}) {
  const zh = language === "zh",
    index = zh ? 0 : 1,
    current = values[active];
  const update = (patch: Partial<Region>) =>
    onChange(
      values.map((value, n) => (n === active ? { ...value, ...patch } : value)),
    );
  return (
    <section>
      <div
        className="tool-groups"
        role="group"
        aria-label={zh ? "区域列表" : "Regions"}
      >
        {values.map((region, n) => (
          <button
            key={n}
            type="button"
            aria-pressed={n === active}
            onClick={() => onActive(n)}
          >
            {region.name || `${zh ? "区域" : "Region"} ${n + 1}`} ·{" "}
            {region.atom_indices.length}
          </button>
        ))}
        <button
          type="button"
          disabled={values.length >= 20}
          onClick={() => {
            let number = values.length + 1,
              name = "";
            do {
              name = `${zh ? "区域" : "Region"} ${number++}`;
            } while (values.some((value) => value.name === name));
            onChange([...values, { name, role: "custom", atom_indices: [] }]);
            onActive(values.length);
          }}
        >
          {zh ? "新增区域" : "Add region"}
        </button>
      </div>
      <div className="inline-fields">
        <label className="field">
          {zh ? "区域名称" : "Region name"}
          <input
            value={current.name}
            maxLength={80}
            onChange={(event) => update({ name: event.target.value })}
          />
        </label>
        <label className="field">
          {zh ? "区域角色" : "Region role"}
          <select
            value={current.role}
            title={roles.find((role) => role.id === current.role)?.help[index]}
            onChange={(event) =>
              update({ role: event.target.value as RegionRole })
            }
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label[index]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={values.length <= 1}
          onClick={() => {
            onChange(values.filter((_, n) => n !== active));
            onActive(Math.max(0, active - 1));
          }}
        >
          {zh ? "移除当前区域" : "Remove this region"}
        </button>
        <button
          type="button"
          disabled={!current.atom_indices.length}
          onClick={() => update({ atom_indices: [] })}
        >
          {zh ? "清空当前选区" : "Clear this selection"}
        </button>
      </div>
    </section>
  );
}
