"""Idempotent artifact ingestion; scientific execution and indexing have separate outcomes."""

import json

from ..artifacts import contained, list_artifacts
from ..store import now
from .contracts import VersionInput
from .storage import ScientificStore

KINDS = {
    ".sdf": "ligand",
    ".mol": "ligand",
    ".mol2": "ligand",
    ".pdb": "structure",
    ".cif": "structure",
    ".fasta": "sequences",
    ".fa": "sequences",
}
OBJECT_KINDS = {
    "ligand": "molecule",
    "structure": "structure",
    "sequences": "sequence",
    "config": "analysis",
}


class OutputCatalog:
    def __init__(self, store, assets):
        self.store, self.assets = store, assets
        self.scientific = ScientificStore(store, assets)
        with store.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS research_output_index (
                job_id TEXT PRIMARY KEY, state TEXT NOT NULL, count INTEGER NOT NULL,
                errors TEXT NOT NULL, updated_at TEXT NOT NULL)""")

    def preserve(self, job_id, file, kind):
        if file.stat().st_size > 25 * 1024**2:
            raise ValueError("Artifact exceeds the 25 MiB reusable-input limit.")
        content = file.read_bytes()
        asset = self.assets.save(file.name, kind, content)
        object_kind = OBJECT_KINDS.get(kind)
        if not object_kind:
            return asset, []
        records = (
            len([part for part in content.decode("utf-8-sig").split("$$$$") if part.strip()])
            if asset.suffix == ".sdf"
            else 1
        )
        if not 1 <= records <= 500:
            raise ValueError("Split this SDF into files with one to 500 molecular records.")
        parent, relation = None, "derived_from"
        job = self.store.get(str(job_id))
        if job and job.request.operation == "diffsbdd":
            payload = job.request.payload
            ref = (
                getattr(payload, "original", None)
                if payload.mode == "edit"
                else getattr(payload, "protein", None)
                if payload.mode == "prepare"
                else None
            )
            if ref and ref.version_id and self.scientific.get(ref.version_id).kind == object_kind:
                parent = ref.version_id
                relation = "edited_from" if payload.mode == "edit" else "prepared_from"
        entries = []
        for record in range(records):
            suffix = f" · #{record + 1}" if records > 1 else ""
            entries.append(
                (
                    VersionInput(
                        asset_id=asset.id,
                        kind=object_kind,
                        label=file.name[: 120 - len(suffix)] + suffix,
                        record=record,
                        parent_id=parent,
                        relation=relation,
                    ),
                    f"artifact:{job_id}:{asset.id}:{kind}:{record}",
                )
            )
        objects = self.scientific.create_many(entries, source_job=job_id)
        return asset, objects

    def index(self, job, root):
        errors, count = [], 0
        artifacts = list_artifacts(root)
        for artifact in artifacts:
            try:
                file = contained(root, artifact.name)
                kind = KINDS.get(file.suffix.lower())
                if file.name == "result.json":
                    kind = "config"
                if not kind:
                    continue
                _, objects = self.preserve(job.id, file, kind)
                count += len(objects)
            except (ValueError, KeyError, OSError) as exc:
                errors.append({"artifact": artifact.name, "reason": str(exc)})
        if len(artifacts) == 500:
            errors.append(
                {
                    "artifact": "",
                    "reason": "Artifact listing reached its 500-file limit. "
                    "Preserve additional outputs individually.",
                }
            )
        with self.store.connect() as db:
            db.execute(
                "INSERT INTO research_output_index VALUES(?,?,?,?,?) ON CONFLICT(job_id) "
                "DO UPDATE SET state=excluded.state,count=excluded.count,errors=excluded.errors,"
                "updated_at=excluded.updated_at",
                (job.id, "partial" if errors else "complete", count, json.dumps(errors), now()),
            )
        return {
            "job_id": job.id,
            "state": "partial" if errors else "complete",
            "count": count,
            "errors": errors,
        }

    def recent(self, limit=20):
        with self.store.connect() as db:
            return [
                {**dict(row), "errors": json.loads(row["errors"])}
                for row in db.execute(
                    "SELECT * FROM research_output_index ORDER BY updated_at DESC LIMIT ?",
                    (limit,),
                )
            ]
