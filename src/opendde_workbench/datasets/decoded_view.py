"""Bounded read-only inspection of native member/UMI observations, including legacy evidence."""


def page(database, result, *, limit, offset, search):
    columns = {row[1] for row in database.execute("PRAGMA table_info(reads)")}
    assessed = "umi_status" in columns and result.metadata.get("umi_integrity") is not None
    fields = "sample,library,member,umi,count AS reads,"
    fields += "umi_status" if assessed else "NULL AS umi_status"
    pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    where = " WHERE member LIKE ? ESCAPE '\\' OR sample LIKE ? ESCAPE '\\'" if search else ""
    values = [pattern, pattern] if search else []
    rows = database.execute(
        "SELECT "
        + fields
        + " FROM reads"
        + where
        + " ORDER BY count DESC,sample,library,member,umi LIMIT ? OFFSET ?",
        (*values, limit + 1, offset),
    ).fetchall()
    lengths = (result.metadata.get("umi_integrity") or {}).get("expected_lengths", {})
    return {
        "rows": [
            {
                **dict(row),
                "observed_length": len(row["umi"]),
                "expected_length": lengths.get(row["library"]),
            }
            for row in rows[:limit]
        ],
        "offset": offset,
        "total": result.counts["distinct_umi_records"],
        "has_more": len(rows) > limit,
    }
