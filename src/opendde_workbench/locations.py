"""Stable user-owned locations shared by the CLI and the deployment service."""

import json
import os
from pathlib import Path
from uuid import uuid4


def home() -> Path:
    return (
        Path(os.environ.get("WB_HOME", "~/.local/share/opendde-workbench")).expanduser().resolve()
    )


def atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(f".{path.name}-{uuid4()}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            temporary.chmod(0o600)
            stream.write(json.dumps(value, ensure_ascii=False, indent=2))
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
