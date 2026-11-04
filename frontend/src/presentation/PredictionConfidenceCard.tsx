import { useId, type ReactNode } from "react";
import "./prediction-confidence-card.css";

export function PredictionConfidenceCard({
  title,
  unit,
  controls,
  className,
  children,
}: {
  title: string;
  unit?: string;
  controls?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      className={["prediction-confidence-card", className]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={titleId}
    >
      <header className="prediction-confidence-heading">
        <h3 id={titleId}>{title}</h3>
        {unit && <span>{unit}</span>}
      </header>
      {controls && (
        <div className="prediction-confidence-toolbar">{controls}</div>
      )}
      <div className="prediction-confidence-body">{children}</div>
    </section>
  );
}
