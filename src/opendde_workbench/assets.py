"""Immutable uploads addressed by UUID, never by browser-supplied filesystem paths."""

import hashlib
import json
import os
import re
import shutil
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel

from .harness_contract import asset_references
from .store import Store, now

AssetKind = Literal["structure", "ligand", "msa", "template", "config", "sequences"]
EXTENSIONS = {
    "structure": {".pdb", ".cif"},
    "ligand": {".sdf", ".mol", ".mol2", ".pdb"},
    "msa": {".a3m"},
    "template": {".a3m", ".hhr"},
    "config": {".json", ".yaml", ".yml"},
    "sequences": {".fasta", ".fa"},
}


class Asset(BaseModel):
    id: str
    name: str
    kind: AssetKind
    suffix: str
    size: int
    sha256: str
    created_at: str


class AssetStore:
    def __init__(self, store: Store, root: Path, max_total: int = 512 * 1024**2):
        self.store, self.root, self.max_total = store, root, max_total
        root.mkdir(parents=True, exist_ok=True)
        with store.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, suffix TEXT NOT NULL,
                size INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL)""")

    def get(self, identifier: str | UUID) -> Asset:
        identifier = str(UUID(str(identifier)))
        with self.store.connect() as db:
            row = db.execute("SELECT * FROM assets WHERE id=?", (identifier,)).fetchone()
        if row is None:
            raise FileNotFoundError("Uploaded input was not found.")
        return Asset.model_validate(dict(row))

    def list(self, limit: int = 100, offset: int = 0) -> list[Asset]:
        with self.store.connect() as db:
            return [
                Asset.model_validate(dict(row))
                for row in db.execute(
                    "SELECT * FROM assets ORDER BY created_at DESC LIMIT ? OFFSET ?",
                    (limit, offset),
                )
            ]

    def path(self, asset: Asset) -> Path:
        folder = self.root / str(UUID(asset.id))
        path = folder / ("content" + asset.suffix)
        if (
            folder.is_symlink()
            or path.is_symlink()
            or not path.is_file()
            or not path.resolve().is_relative_to(self.root.resolve())
        ):
            raise FileNotFoundError("Uploaded input is unavailable.")
        if path.stat().st_size != asset.size:
            raise ValueError("Uploaded input size changed; restore or upload the file again.")
        return path

    def save(self, name: str, kind: AssetKind, content: bytes) -> Asset:
        name = re.split(r"[/\\]", name)[-1].strip()
        if not name or len(name) > 120 or any(ord(c) < 32 for c in name):
            raise ValueError("Use a readable filename of at most120 characters.")
        suffix = Path(name).suffix.lower()
        if suffix not in EXTENSIONS[kind]:
            raise ValueError("This file extension is not supported for the selected input type.")
        if not content or len(content) > 25 * 1024**2 or b"\x00" in content:
            raise ValueError("Upload a nonempty text input no larger than25MiB.")
        try:
            text = content.decode("utf-8-sig")
        except UnicodeError as exc:
            raise ValueError("Scientific text inputs must use UTF-8 encoding.") from exc
        if kind in {"msa", "sequences"} and not text.lstrip().startswith(">"):
            raise ValueError("Alignment/sequence input must start with a FASTA header.")
        if suffix == ".json":
            try:
                json.loads(text)
            except RecursionError as exc:
                raise ValueError("JSON input is nested too deeply.") from exc
        asset = Asset(
            id=str(uuid4()),
            name=name,
            kind=kind,
            suffix=suffix,
            size=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
            created_at=now(),
        )
        folder = self.root / asset.id
        created = False
        try:
            with self.store.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                existing = db.execute(
                    "SELECT * FROM assets WHERE sha256=? AND kind=? AND name=? LIMIT 1",
                    (asset.sha256, kind, name),
                ).fetchone()
                if existing:
                    previous = Asset.model_validate(dict(existing))
                    if (
                        hashlib.sha256(self.path(previous).read_bytes()).hexdigest()
                        != previous.sha256
                    ):
                        raise ValueError("Existing uploaded file failed its integrity check.")
                    return previous
                used = db.execute("SELECT coalesce(sum(size),0) FROM assets").fetchone()[0]
                if used + asset.size > self.max_total:
                    raise ValueError("Uploaded-input storage is full. Remove unused inputs.")
                folder.mkdir(mode=0o700)
                created = True
                path = folder / ("content" + suffix)
                with path.open("xb") as file:
                    file.write(content)
                    file.flush()
                    os.fsync(file.fileno())
                db.execute(
                    "INSERT INTO assets(id,name,kind,suffix,size,sha256,created_at) "
                    "VALUES(?,?,?,?,?,?,?)",
                    (
                        asset.id,
                        asset.name,
                        asset.kind,
                        asset.suffix,
                        asset.size,
                        asset.sha256,
                        asset.created_at,
                    ),
                )
        except Exception:
            if created:
                shutil.rmtree(folder)
            raise
        return asset

    def validate_bindings(self, request) -> dict[str, Asset]:
        bindings = self._validate_bindings(request)
        for ref in getattr(request, "scientific_inputs", []):
            asset = bindings.get(str(ref.asset_id))
            if asset is None or asset.sha256 != ref.sha256:
                raise ValueError(
                    "Scientific version must refer to an actual task input with a matching digest."
                )
            if ref.version_id:
                from .research.storage import ScientificStore

                ScientificStore(self.store, self).validate_reference(ref)
        return bindings

    def _validate_bindings(self, request) -> dict[str, Asset]:
        bindings = {}
        if getattr(request, "operation", None) == "pocket_search":
            ref = request.protein
            asset = self.get(ref.asset_id)
            if (
                asset.kind != "structure"
                or asset.suffix not in {".pdb", ".cif"}
                or asset.sha256 != ref.sha256
            ):
                raise ValueError("Pocket search requires an exact PDB/mmCIF structural asset.")
            if ref.version_id:
                from .research.storage import ScientificStore

                ScientificStore(self.store, self).validate_reference(ref)
            self.path(asset)
            return {asset.id: asset}
        if getattr(request, "operation", None) == "diffsbdd":
            from .diffsbdd.contract import references

            for role, ref in references(request):
                asset = self.get(ref.asset_id)
                expected = "structure" if role == "protein" else "ligand"
                suffix = ".pdb" if role == "protein" else ".sdf"
                if asset.kind != expected or asset.suffix != suffix:
                    raise ValueError(
                        f"DiffSBDD {role} requires an uploaded {suffix} {expected} asset. "
                        "Convert CIF explicitly before using this PDB adapter."
                    )
                if asset.sha256 != ref.sha256:
                    raise ValueError("Scientific selection is stale: asset digest does not match.")
                if ref.conformer != 0 or role == "protein" and ref.record != 0:
                    raise ValueError(
                        "This adapter requires the first conformer and first protein model."
                    )
                if ref.version_id:
                    from .research.storage import ScientificStore

                    ScientificStore(self.store, self).validate_reference(ref)
                self.path(asset)
                bindings[asset.id] = asset
            return bindings
        fields = {
            "ligand_file": "ligand",
            "paired_msa": "msa",
            "unpaired_msa": "msa",
            "template_hits": "template",
        }
        for component in getattr(request, "components", []):
            for field, expected in fields.items():
                identifier = getattr(component, field, None)
                if not identifier:
                    continue
                asset = self.get(identifier)
                if asset.kind != expected:
                    raise ValueError(f"{field} requires an uploaded {expected} file.")
                self.path(asset)
                bindings[asset.id] = asset
        for identifier in getattr(request, "assets", []):
            asset = self.get(identifier)
            if asset.kind != "structure":
                raise ValueError("Structure conversion accepts PDB/CIF structure inputs.")
            self.path(asset)
            bindings[asset.id] = asset
        for identifier in getattr(request, "ligand_files", []):
            asset = self.get(identifier)
            if asset.kind != "ligand":
                raise ValueError("Molecular properties require ligand files.")
            self.path(asset)
            bindings[asset.id] = asset
        for field, identifier in asset_references(getattr(request, "payload", {})):
            asset = self.get(identifier)
            expected = (
                "config"
                if field in {"candidates_json_path", "legacy_path", "current_path"}
                else "msa"
                if "msa" in field.lower()
                else "template"
                if "template" in field.lower()
                else "structure"
            )
            if asset.kind != expected:
                raise ValueError(f"{field} requires an uploaded {expected} input.")
            self.path(asset)
            bindings[asset.id] = asset
        return bindings

    def snapshot(self, request, directory: Path) -> dict[str, str]:
        bindings = self.validate_bindings(request)
        result = {}
        destination = directory / "assets"
        destination.mkdir(mode=0o700, exist_ok=True)
        for identifier, asset in bindings.items():
            target = destination / (identifier + asset.suffix)
            if target.is_symlink():
                raise ValueError("Input snapshot must not be a symbolic link.")
            shutil.copyfile(self.path(asset), target)
            if hashlib.sha256(target.read_bytes()).hexdigest() != asset.sha256:
                raise ValueError("Uploaded input integrity check failed.")
            if asset.suffix == ".sdf" and getattr(request, "operation", None) not in {
                "properties",
                "diffsbdd",
            }:
                records = [
                    part
                    for part in target.read_text(encoding="utf-8-sig").split("$$$$")
                    if part.strip()
                ]
                if len(records) != 1:
                    raise ValueError(
                        "A prediction ligand requires one 3D SDF record. "
                        "Split this file or use molecular properties for the whole library."
                    )
            result[identifier] = "/job/assets/" + target.name
        return result

    def delete_unused(self, identifier: UUID) -> None:
        asset = self.get(identifier)
        path = self.path(asset)
        tombstone = self.root / (".deleted-" + asset.id)
        moved = False
        try:
            with self.store.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                if db.execute(
                    "SELECT 1 FROM jobs WHERE request LIKE ? LIMIT 1", ("%" + asset.id + "%",)
                ).fetchone():
                    raise ValueError("This input is referenced by a task and cannot be removed.")
                has_objects = db.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='scientific_objects'"
                ).fetchone()
                if (
                    has_objects
                    and db.execute(
                        "SELECT 1 FROM scientific_objects WHERE asset_id=? LIMIT 1", (asset.id,)
                    ).fetchone()
                ):
                    raise ValueError(
                        "This file belongs to a scientific version and cannot be removed."
                    )
                has_plans = db.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='design_plans'"
                ).fetchone()
                if (
                    has_plans
                    and db.execute(
                        "SELECT 1 FROM design_plans WHERE config LIKE ? LIMIT 1",
                        ("%" + asset.id + "%",),
                    ).fetchone()
                ):
                    raise ValueError(
                        "This input is referenced by a design plan and cannot be removed."
                    )
                has_workflows = db.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='workflow_plans'"
                ).fetchone()
                if (
                    has_workflows
                    and db.execute(
                        "SELECT 1 FROM workflow_plans WHERE body LIKE ? LIMIT 1",
                        ("%" + asset.id + "%",),
                    ).fetchone()
                ):
                    raise ValueError("This input belongs to a research plan and cannot be removed.")
                path.parent.rename(tombstone)
                moved = True
                db.execute("DELETE FROM assets WHERE id=?", (asset.id,))
        except Exception:
            if moved:
                tombstone.rename(path.parent)
            raise
        shutil.rmtree(tombstone)
