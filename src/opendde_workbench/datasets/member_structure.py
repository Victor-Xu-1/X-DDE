"""Extract one actual indexed MOL record without embedding, optimization or rewriting."""

import sqlite3
import time
from pathlib import Path

from ..artifacts import contained
from .result import DatasetResult


def indexed_structure(root: Path, result: DatasetResult, member_id: str):
    if result.data_kind != "index":
        raise ValueError("Choose an indexed molecular record.")
    file = contained(root, "index-members.sqlite")
    db = sqlite3.connect(file.as_uri() + "?mode=ro&immutable=1", uri=True)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA query_only=ON")
        db.execute("PRAGMA trusted_schema=OFF")
        deadline = time.monotonic() + 5
        db.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
        rows = db.execute(
            "SELECT id,display_name,supplier,source_job,source_record,"
            "CASE WHEN length(molblock)<=5242880 THEN molblock ELSE NULL END molblock "
            "FROM members WHERE id=? LIMIT 2",
            (member_id,),
        ).fetchall()
        if len(rows) != 1:
            raise ValueError("Choose one exact indexed member.")
        row = dict(rows[0])
        text = row.pop("molblock")
        if not isinstance(text, str) or not text.strip() or "M  END" not in text:
            raise ValueError("The indexed member has no valid native MOL record.")
        content = text.encode("utf-8")
        if len(content) > 5 * 1024**2:
            raise ValueError("The indexed MOL exceeds its preview size budget.")
        return row, content
    finally:
        db.close()
