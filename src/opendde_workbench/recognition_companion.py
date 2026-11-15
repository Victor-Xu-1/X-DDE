"""Check/apply native UI locale integration. Does not install or run a service/model."""

import argparse
import hashlib
import json
import os
from pathlib import Path
from uuid import uuid4

RESOURCES = Path(__file__).parent / "data" / "recognition_locale"
NATIVE_FILES = {"App.tsx", "EditorBoundary.tsx", "StopConfirmation.tsx"}
ADAPTERS = ("recognition-locale.ts", "recognition-host-ui-locale.ts")


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def prepare(host: Path, resources: Path = RESOURCES) -> dict[Path, bytes]:
    """Prove every preimage/postimage before proposing any write."""
    host = host.resolve(strict=True)
    manifest = json.loads((resources / "patch.json").read_text())
    if manifest.get("schema_version") != 1:
        raise ValueError("Unsupported companion manifest")
    records = manifest.get("files", [])
    expected = {"frontend/src/" + name for name in NATIVE_FILES}
    if {record["path"] for record in records} != expected or len(records) != 3:
        raise ValueError("Unexpected native integration scope")
    updates = {}
    for record in records:
        target = host / record["path"]
        if target.resolve() != target or not target.is_file():
            raise ValueError("Native target must be a regular file inside the host")
        original = target.read_bytes()
        if digest(original) == record["after_sha256"]:
            continue
        if digest(original) != record["before_sha256"]:
            raise ValueError(f"Unrecognized native source: {record['path']}")
        updated = original.decode("utf-8")
        for change in record["changes"]:
            if updated.count(change["before"]) != 1:
                raise ValueError("Native hunk no longer matches")
            updated = updated.replace(change["before"], change["after"], 1)
        payload = updated.encode("utf-8")
        if digest(payload) != record["after_sha256"]:
            raise ValueError("Native postimage does not match the companion")
        updates[target] = payload
    for name in ADAPTERS:
        target = host / "frontend/src" / name
        if target.resolve() != target:
            raise ValueError("Adapter target cannot be a symlink")
        payload = (resources / name).read_bytes()
        if target.exists():
            if target.read_bytes() != payload:
                raise ValueError(f"Existing adapter differs: {name}")
        else:
            updates[target] = payload
    return updates


def apply(host: Path, backup_directory: Path, resources: Path = RESOURCES) -> dict:
    updates = prepare(host, resources)
    if not updates:
        return {"changed": 0, "already_applied": True}
    host = host.resolve()
    backup_directory = backup_directory.resolve()
    if backup_directory == host or host in backup_directory.parents:
        raise ValueError("Backups must be outside the source tree")
    backup = backup_directory / ("recognition-locale-" + str(uuid4()))
    originals = {path: path.read_bytes() if path.exists() else None for path in updates}
    if prepare(host, resources) != updates:
        raise ValueError("Native source changed during planning")
    backup.mkdir(parents=True)
    receipt = []
    for path, original in originals.items():
        relative = path.relative_to(host)
        if original is not None:
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            saved.write_bytes(original)
        receipt.append(
            {
                "path": str(relative),
                "before_sha256": digest(original) if original is not None else None,
                "after_sha256": digest(updates[path]),
            }
        )
    (backup / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    written = []
    try:
        for path, payload in updates.items():
            # Recheck at the write boundary; preserve edits made after planning.
            current = path.read_bytes() if path.exists() else None
            if current != originals[path]:
                raise ValueError("Native source changed during apply")
            temporary = path.with_name(path.name + "." + str(uuid4()) + ".tmp")
            try:
                temporary.write_bytes(payload)
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
            written.append(path)
    except Exception:
        for path in reversed(written):
            if path.read_bytes() != updates[path]:
                continue  # Do not overwrite a concurrent owner's edit.
            original = originals[path]
            if original is None:
                path.unlink()
            else:
                path.write_bytes(original)
        raise
    return {"changed": len(updates), "backup": str(backup), "already_applied": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--backup-directory", type=Path)
    args = parser.parse_args()
    if args.apply:
        if not args.backup_directory:
            parser.error("--apply requires --backup-directory")
        result = apply(args.host, args.backup_directory)
    else:
        result = {"changed": len(prepare(args.host)), "check_only": True}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
