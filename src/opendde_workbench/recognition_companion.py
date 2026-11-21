"""Check/apply native UI locale integration. Does not install or run a service/model."""

import argparse
import hashlib
import json
import os
from pathlib import Path
from uuid import uuid4

RESOURCES = Path(__file__).parent / "data" / "recognition_locale"
NATIVE_FILES = {
    "App.tsx", "EditorBoundary.tsx", "StopConfirmation.tsx", "MoleculeEditor.tsx",
    "useWorkbench.ts", "useXddeBridge.ts",
}
ADAPTERS = {
    "ketcher-conversions.ts": "frontend/src/editors/ketcher-conversions.ts",
    "recognition-host-bridge.ts": "frontend/src/utilities/recognition-host-bridge.ts",
    "recognition-foreground.ts": "frontend/src/utilities/recognition-foreground.ts",
    "recognition-locale.ts": "frontend/src/utilities/recognition-locale.ts",
    "recognition-host-ui-locale.ts": "frontend/src/utilities/recognition-host-ui-locale.ts",
    "recognition-host-editor.ts": "frontend/src/editors/recognition-host-editor.ts",
    "portable-smiles.ts": "frontend/src/editors/portable-smiles.ts",
    "portable-smiles-ring-stereo.ts": "frontend/src/editors/portable-smiles-ring-stereo.ts",
    "ketcher-contract.ts": "frontend/src/editors/ketcher-contract.ts",
    "ketcher-appearance.ts": "frontend/src/editors/ketcher-appearance.ts",
    "ketcher-hydrogens.ts": "frontend/src/editors/ketcher-hydrogens.ts",
    "editor-lifetime.ts": "frontend/src/editors/editor-lifetime.ts",
    "native-molecular-viewport.ts": "frontend/src/editors/native-molecular-viewport.ts",
    "molecule-readiness.ts": "frontend/src/editors/molecule-readiness.ts",
    "recognition-host-editor.css": "frontend/src/editors/recognition-host-editor.css",
}


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
    if {record["path"] for record in records} != expected or len(records) != len(NATIVE_FILES):
        raise ValueError("Unexpected native integration scope")
    updates = {}
    for record in records:
        target = host / record["path"]
        if target.resolve() != target or not target.is_file():
            raise ValueError("Native target must be a regular file inside the host")
        original = target.read_bytes()
        original_hash = digest(original)
        if original_hash == record["after_sha256"]:
            continue
        legacy_step = record.get("final_step")
        final_steps = record.get("final_steps", [legacy_step] if legacy_step else [])
        step_index = {step["before_sha256"]: i for i, step in enumerate(final_steps)}
        if len(step_index) != len(final_steps):
            raise ValueError("Duplicate native intermediate")
        if original_hash in step_index:
            changes = []
            final_steps = final_steps[step_index[original_hash]:]
        elif original_hash == record["before_sha256"]:
            changes = record["changes"]
        else:
            prior = [item for item in record.get("upgrades", [])
                     if item["before_sha256"] == original_hash]
            if len(prior) != 1:
                raise ValueError(f"Unrecognized native source: {record['path']}")
            changes = prior[0]["changes"]
        updated = original.decode("utf-8")
        updated = apply_changes(updated, changes)
        for final_step in final_steps:
            if digest(updated.encode("utf-8")) != final_step["before_sha256"]:
                raise ValueError("Native intermediate does not match the companion")
            updated = apply_changes(updated, final_step["changes"])
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
                known = manifest.get("adapter_upgrades", {}).get(name, [])
                if digest(target.read_bytes()) not in known:
                    raise ValueError(f"Existing adapter differs: {name}")
                updates[target] = payload
        else:
            updates[target] = payload
    return updates


def apply_changes(text, changes):
    for change in changes:
        if text.count(change["before"]) != 1:
            raise ValueError("Native hunk no longer matches")
        text = text.replace(change["before"], change["after"], 1)
    return text


def _replace(path: Path, expected: bytes | None, payload: bytes, owner):
    temporary = path.with_name(path.name + "." + str(uuid4()) + ".tmp")
    try:
        temporary.write_bytes(payload)
        os.chmod(temporary, owner.st_mode & 0o777 if expected is not None else 0o644)
        if hasattr(os, "chown"):
            created = temporary.stat()
            if (created.st_uid, created.st_gid) != (owner.st_uid, owner.st_gid):
                os.chown(temporary, owner.st_uid, owner.st_gid)
        # Staging is complete before the final observation. Sole-writer cutover is required.
        if path.resolve() != path:
            raise ValueError("Native source became a symlink during apply")
        current = path.read_bytes() if path.exists() else None
        if current != expected:
            raise ValueError("Native source changed during apply")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _recover(written, originals, updates, metadata, failure):
    for path in reversed(written):
        try:
            if not path.exists() or path.resolve() != path or path.read_bytes() != updates[path]:
                failure.add_note(f"Rollback retained an owner change: {path.name}")
                continue
            if originals[path] is None:
                path.unlink()
            else:
                _replace(path, updates[path], originals[path], metadata[path])
        except (OSError, ValueError) as error:
            failure.add_note(f"Rollback incomplete for {path.name}: {type(error).__name__}")


def apply(
    host: Path,
    backup_directory: Path,
    resources: Path = RESOURCES,
    *,
    exclusive_source: bool = False,
) -> dict:
    if not exclusive_source:
        raise ValueError("Apply requires an offline source copy with exclusive writer ownership")
    updates = prepare(host, resources)
    if not updates:
        return {"changed": 0, "already_applied": True}
    host = host.resolve()
    backup_directory = backup_directory.resolve()
    if backup_directory == host or host in backup_directory.parents:
        raise ValueError("Backups must be outside the source tree")
    backup = backup_directory / ("recognition-locale-" + str(uuid4()))
    originals = {path: path.read_bytes() if path.exists() else None for path in updates}
    metadata = {path: path.stat() if path.exists() else path.parent.stat() for path in updates}
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
            _replace(path, originals[path], payload, metadata[path])
            written.append(path)
    except Exception as failure:
        _recover(written, originals, updates, metadata, failure)
        failure.add_note(f"Original source backups: {backup}")
        raise
    return {"changed": len(updates), "backup": str(backup), "already_applied": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--exclusive-source",
        action="store_true",
        help="Confirm a private offline source copy with no other writers; not an automatic lock",
    )
    parser.add_argument("--backup-directory", type=Path)
    args = parser.parse_args()
    if args.apply:
        if not args.backup_directory or not args.exclusive_source:
            parser.error("--apply requires --backup-directory and --exclusive-source")
        result = apply(args.host, args.backup_directory, exclusive_source=True)
    else:
        result = {"changed": len(prepare(args.host)), "check_only": True}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
