"""Read actual prepared or indexed members without recomputing scientific properties."""

import sqlite3
import time
from pathlib import Path

from ..artifacts import contained
from .result import DatasetResult


def member_page(
    root: Path, result: DatasetResult, *, limit: int, offset: int, search: str, order: str
):
    if result.data_kind not in {"library", "index"}:
        raise ValueError("Choose a prepared or indexed compound library.")
    indexed = result.data_kind == "index"
    if indexed and order != "record":
        raise ValueError("Indexed member records do not supply descriptor ordering.")
    file = contained(root, "index-members.sqlite" if indexed else "library.sqlite")
    database = sqlite3.connect(file.as_uri() + "?mode=ro&immutable=1", uri=True)
    database.row_factory = sqlite3.Row
    try:
        database.execute("PRAGMA query_only=ON")
        database.execute("PRAGMA trusted_schema=OFF")
        deadline = time.monotonic() + 5
        database.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
        pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        if indexed:
            clause = (
                "WHERE id LIKE ? ESCAPE '\\' OR smiles LIKE ? ESCAPE '\\' "
                "OR display_name LIKE ? ESCAPE '\\' OR supplier LIKE ? ESCAPE '\\'"
                if search
                else ""
            )
            query = (
                "SELECT id,smiles,display_name,supplier,source_record,source_job FROM members "
                + clause
                + " ORDER BY ordinal,id LIMIT ? OFFSET ?"
            )
            parameters = [pattern] * 4 if search else []
        else:
            clause = (
                "WHERE c.smiles LIKE ? ESCAPE '\\' OR EXISTS "
                "(SELECT 1 FROM records r WHERE r.compound_id=c.id "
                "AND r.supplier_id LIKE ? ESCAPE '\\')"
                if search
                else ""
            )
            sort = {
                "record": "c.source_record",
                "mw": "c.mw",
                "logp": "c.logp",
                "qed": "c.qed DESC",
            }[order]
            query = (
                "SELECT c.id,c.smiles,c.mw,c.logp,c.tpsa,c.qed,c.hbd,c.hba,c.rotatable, "
                "c.source_record,c.supplier,(SELECT supplier_id FROM records r WHERE "
                "r.record=c.source_record) display_name,(SELECT COUNT(*) FROM records r "
                "WHERE r.compound_id=c.id) offers FROM compounds c "
                + clause
                + " ORDER BY "
                + sort
                + ",c.id LIMIT ? OFFSET ?"
            )
            parameters = [pattern] * 2 if search else []
        rows = database.execute(query, (*parameters, limit + 1, offset)).fetchall()
        return {
            "rows": [dict(row) for row in rows[:limit]],
            "offset": offset,
            "total": result.counts["indexed" if indexed else "unique_compounds"],
            "has_more": len(rows) > limit,
        }
    finally:
        database.close()
