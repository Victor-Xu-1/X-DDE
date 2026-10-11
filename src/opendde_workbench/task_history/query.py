"""Bounded, stable queries over the existing personal history and immutable jobs."""

from .kinds import classification_sql


def history_page(
    library,
    *,
    capabilities=(),
    project_id=None,
    status=None,
    query="",
    offset=0,
    limit=20,
    scope="research",
):
    library.synchronize()
    classification, parameters = classification_sql()
    source = (
        "EXISTS (SELECT 1 FROM example_library_tasks e "
        "WHERE e.job_id=j.id AND e.origin='fixed_example')"
        if scope == "examples"
        else "NOT EXISTS (SELECT 1 FROM example_library_tasks e WHERE e.job_id=j.id)"
    )
    sql = (
        f"WITH history AS (SELECT j.*, {classification} AS capability_id FROM jobs j WHERE {source}"
    )
    if project_id:
        sql += " AND json_extract(j.request, '$.project_id') = ?"
        parameters.append(str(project_id))
    sql += ") "
    filters, values = [], []
    if capabilities:
        filters.append("capability_id IN (" + ",".join("?" for _ in capabilities) + ")")
        values.extend(capabilities)
    if status:
        filters.append("status = ?")
        values.append(status)
    if query.strip():
        filters.append(
            "(instr(lower(json_extract(request, '$.name')), lower(?)) > 0 OR "
            "instr(lower(id), lower(?)) > 0)"
        )
        values.extend([query.strip(), query.strip()])
    where = " WHERE " + " AND ".join(filters) if filters else ""
    with library.store.connect() as db:
        # Counts and rows share a read snapshot even when the worker updates another job.
        db.execute("BEGIN")
        counts = {
            row["capability_id"]: {"total": row["total"], "active": row["active"]}
            for row in db.execute(
                sql + "SELECT capability_id, COUNT(*) AS total, "
                "SUM(status IN ('queued', 'running', 'cancelling')) AS active FROM history "
                "GROUP BY capability_id",
                parameters,
            )
        }
        total = db.execute(
            sql + "SELECT COUNT(*) FROM history" + where, parameters + values
        ).fetchone()[0]
        rows = db.execute(
            sql
            + "SELECT * FROM history"
            + where
            + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
            parameters + values + [limit, offset],
        ).fetchall()
        items = [
            {
                "job": library.store.decode(
                    {k: row[k] for k in row.keys() if k != "capability_id"}
                ),
                "capability_id": row["capability_id"],
            }
            for row in rows
        ]
    return {"items": items, "counts": counts, "total": total, "offset": offset, "limit": limit}
