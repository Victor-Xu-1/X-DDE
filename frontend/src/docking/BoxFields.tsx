import type { Language } from "../types";
export function BoxFields({
  language,
  center,
  onCenter,
  size,
  onSize,
}: {
  language: Language;
  center: string[];
  onCenter(value: string[]): void;
  size: string[];
  onSize(value: string[]): void;
}) {
  const zh = language === "zh";
  return (
    <>
      <div className="operation-grid">
        {["X", "Y", "Z"].map((axis, index) => (
          <div key={axis}>
            <label className="field">
              {zh ? "中心" : "Center"} {axis} (Å)
              <input
                type="number"
                value={center[index]}
                step="0.1"
                onChange={(event) =>
                  onCenter(
                    center.map((v, n) =>
                      n === index ? event.target.value : v,
                    ),
                  )
                }
              />
            </label>
            <label className="field">
              {zh ? "边长" : "Length"} {axis} (Å)
              <input
                type="number"
                min={4}
                max={100}
                value={size[index]}
                onChange={(event) =>
                  onSize(
                    size.map((v, n) => (n === index ? event.target.value : v)),
                  )
                }
              />
            </label>
          </div>
        ))}
      </div>
    </>
  );
}
