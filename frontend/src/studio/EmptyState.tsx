import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  role,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  role?: "alert" | "status";
  children?: ReactNode;
}) {
  return (
    <div className="empty-state" role={role}>
      <span className="empty-state-icon" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  );
}
