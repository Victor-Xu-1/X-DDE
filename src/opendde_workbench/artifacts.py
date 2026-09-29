"""Result containment and bounded log access."""

from pathlib import Path

from .models import Artifact


def contained(root: Path, name: str) -> Path:
    candidate = root / name
    if Path(name).is_absolute() or ".." in Path(name).parts or "\\" in name:
        raise ValueError("Invalid artifact path.")
    if not candidate.resolve().is_relative_to(root.resolve()):
        raise ValueError("Artifact escapes task directory.")
    if any(part.is_symlink() for part in [candidate, *candidate.parents] if part != root.parent):
        raise ValueError("Symbolic links are not downloadable.")
    if not candidate.is_file():
        raise FileNotFoundError(name)
    return candidate


def list_artifacts(root: Path) -> list[Artifact]:
    if not root.exists():
        return []
    results = []
    for path in sorted(root.rglob("*")):
        if len(results) >= 500:
            break
        if path.suffix.lower() not in {
            ".cif",
            ".pdb",
            ".json",
            ".csv",
            ".jsonl",
            ".txt",
            ".a3m",
            ".hhr",
            ".sdf",
            ".fasta",
        }:
            continue
        name = path.relative_to(root).as_posix()
        try:
            safe = contained(root, name)
        except (ValueError, FileNotFoundError):
            continue
        results.append(Artifact(name=name, size=safe.stat().st_size))
    return results


def log_tail(path: Path, limit: int = 65536) -> dict:
    if not path.exists():
        return {"text": "", "truncated": False}
    size = path.stat().st_size
    with path.open("rb") as file:
        file.seek(max(0, size - limit))
        data = file.read(limit)
    return {"text": data.decode("utf-8", errors="replace"), "truncated": size > limit}
