import type { Language } from "../types";
import type { PoseResult } from "./types";
export function PoseViolations({
  poses,
  language,
}: {
  poses: PoseResult[];
  language: Language;
}) {
  const zh = language === "zh",
    checks = poses.flatMap((p) =>
      (p.constraint_checks ?? [])
        .filter((c) => c.violations.length > 0)
        .map((c) => ({ pose: p.record, ...c })),
    );
  if (!checks.length) return null;
  return (
    <details className="pose-violations">
      <summary>{zh ? "查看违反位置" : "Inspect violation positions"}</summary>
      {checks.map((c) => (
        <section key={`${c.pose}:${c.condition_id}`}>
          <p>
            {zh ? "姿势" : "Pose"} {c.pose + 1} ·{" "}
            {zh ? "数值容差" : "Numerical tolerance"} {c.tolerance_angstrom} Å
          </p>
          <ul>
            {c.violations.map((v, i) => (
              <li key={i}>
                {v.output_atom_index === null
                  ? zh
                    ? "重原子中心"
                    : "Heavy-atom centroid"
                  : `${zh ? "输出原子" : "Output atom"} ${v.output_atom_index + 1}`}{" "}
                · {v.position.map((x) => x.toFixed(3)).join(", ")} Å
              </li>
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}
