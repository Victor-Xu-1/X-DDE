"""Read one native prepared/indexed MOL record without computing or rewriting it."""

import re
import sqlite3
import time
from pathlib import Path

from ..artifacts import contained
from .result import DatasetResult


def member_filename(row):
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f\x7f]', "_", row["display_name"] or row["id"])
    return (name.strip()[:100] or "molecule") + ".mol"


def member_structure(root: Path, result: DatasetResult, member_id: str):
    if result.data_kind not in {"index", "library"}:
        raise ValueError("Choose a prepared or indexed molecular record.")
    indexed = result.data_kind == "index"
    file = contained(root, "index-members.sqlite" if indexed else "library.sqlite")
    db = sqlite3.connect(file.as_uri() + "?mode=ro&immutable=1", uri=True)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA query_only=ON")
        db.execute("PRAGMA trusted_schema=OFF")
        deadline = time.monotonic() + 5
        db.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
        query = (
            "SELECT id,display_name,supplier,source_job,source_record,1 source_records,"
            "'unbound_conformer' geometry,"
            "CASE WHEN length(molblock)<=5242880 THEN molblock ELSE NULL END molblock "
            "FROM members WHERE id=? LIMIT 2"
            if indexed
            else "SELECT c.id,r.supplier_id display_name,c.supplier,c.source_record,"
            "(SELECT COUNT(*) FROM records offers WHERE offers.compound_id=c.id) source_records,"
            "CASE WHEN c.is_3d=1 THEN 'source_3d' ELSE 'source_2d' END geometry,"
            "CASE WHEN length(c.molblock)<=5242880 THEN c.molblock ELSE NULL END molblock "
            "FROM compounds c JOIN records r ON r.record=c.source_record AND r.compound_id=c.id "
            "WHERE c.id=? LIMIT 2"
        )
        rows = db.execute(query, (member_id,)).fetchall()
        if len(rows) != 1:
            raise ValueError("Choose one exact native member.")
        row = dict(rows[0])
        text = row.pop("molblock")
        if not isinstance(text, str) or not text.strip() or "M  END" not in text:
            raise ValueError("The member has no valid native MOL record.")
        content = text.encode("utf-8")
        if len(content) > 5 * 1024**2:
            raise ValueError("The MOL exceeds its preview size budget.")
        return row, content
    finally:
        db.close()
