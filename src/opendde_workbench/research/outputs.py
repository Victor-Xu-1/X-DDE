"""Idempotent artifact ingestion; scientific execution and indexing have separate outcomes."""

import hashlib
import json

from ..artifacts import contained, list_artifacts
from ..store import ConflictError, now
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

    def docking_output(self, job_id, file):
        job = self.store.get(str(job_id))
        if not job or job.request.operation != "docking":
            return None
        root = self.assets.root.parent / "jobs" / job.id / "output"
        if not (root / "result.json").exists() and not job.request.constraints:
            return None
        report = contained(root, "result.json")
        if report.stat().st_size > 2 * 1024**2:
            raise ValueError("Docking output report exceeds its typed limit.")
        from ..docking.result import DockingResult

        result = DockingResult.model_validate_json(report.read_text())
        if (result.raw_pose_artifact and file.name == result.raw_pose_artifact) or any(
            file.name == p.diagnostic_artifact for p in result.poses
        ):
            raise ValueError(
                "Raw native poses are diagnostic outputs; "
                "use the qualified pose bundle for handoff."
            )
        if file.name == result.pose_artifact and not any(p.valid for p in result.poses):
            raise ValueError("No qualified pose is available for downstream reuse.")
        return result

    def core_output(self, job_id, file, *, document=None):
        job = self.store.get(str(job_id))
        if not job or job.request.operation != "diffsbdd" or job.request.payload.mode != "inpaint":
            return None
        root = self.assets.root.parent / "jobs" / job.id / "output"
        report = contained(root, "result.json")
        if report.stat().st_size > 2 * 1024**2:
            raise ValueError("Generation output report exceeds its typed limit.")
        result = json.loads(report.read_text()) if document is None else document
        if not isinstance(result, dict):
            raise ValueError("Generation result must be a structured object.")
        if "core_verification" not in result:
            execution = root.parent / "execution.json"
            if execution.is_file():
                execution = contained(execution.parent, execution.name)
                if execution.stat().st_size > 2 * 1024**2:
                    raise ValueError("Generation execution evidence exceeds its limit.")
                if (
                    json.loads(execution.read_text()).get("core_verification")
                    == "rdkit_fixed_core_v1"
                ):
                    raise ValueError("Required independent core verification is missing.")
            return None  # Historical results retain their original, limited native status.
        from ..diffsbdd.quality import validate_verification

        evidence = validate_verification(result, job.request, root)
        if file.suffix.lower() == ".sdf" and (
            file.resolve() != contained(root, evidence.qualified_artifact).resolve()
            or not evidence.qualified_count
        ):
            raise ValueError(
                "Only independently qualified core candidates are reusable; "
                "other molecules remain diagnostic downloads."
            )
        return evidence

    def state_output(self, job_id, file):
        job = self.store.get(str(job_id))
        if not job or job.request.operation != "molecular_states":
            return None
        from ..chemistry.result import validate_result

        root = self.assets.root.parent / "jobs" / job.id / "output"
        report = contained(root, "result.json")
        if report.stat().st_size > 2 * 1024**2:
            raise ValueError("Prepared state report exceeds its display limit.")
        result = validate_result(json.loads(report.read_text()), job.request, root)
        if file.suffix.lower() == ".sdf":
            expected = {
                result.state_artifact: len(result.states),
                result.conformer_artifact: len(result.conformers),
            }
            if (
                file.name not in expected
                or file.resolve() != contained(root, file.name).resolve()
                or not expected[file.name]
            ):
                raise ValueError("Only declared, nonempty state/conformer bundles are reusable.")
        return result

    def preserve(self, job_id, file, kind):
        self.docking_output(job_id, file)
        core = self.core_output(job_id, file)
        states = self.state_output(job_id, file)
        if file.stat().st_size > 25 * 1024**2:
            raise ValueError("Artifact exceeds the 25 MiB reusable-input limit.")
        content = file.read_bytes()
        if (
            core
            and file.suffix.lower() == ".sdf"
            and hashlib.sha256(content).hexdigest() != core.qualified_sha256
        ):
            raise ValueError("Qualified molecule bytes changed before asset registration.")
        if (
            states
            and file.suffix.lower() == ".sdf"
            and hashlib.sha256(content).hexdigest() != states.artifact_sha256[file.name]
        ):
            raise ValueError("Prepared molecular bytes changed before asset registration.")
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
        if job and job.request.operation == "molecular_states" and object_kind == "molecule":
            ref = job.request.molecule
            if ref.version_id:
                parent = ref.version_id
                relation = "prepared_from"
        if job and job.request.operation == "docking":
            ref = (
                job.request.receptor
                if object_kind == "structure"
                else job.request.search.reference
                if file.name == "reference-ligand.sdf"
                and getattr(job.request.search, "kind", None) == "reference_ligand"
                else job.request.ligand
            )
            if ref.version_id and self.scientific.get(ref.version_id).kind == object_kind:
                parent = ref.version_id
                relation = (
                    "prepared_from"
                    if file.name in {"input-ligand.sdf", "receptor.pdb"}
                    else "derived_from"
                )
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
                if job.request.operation == "docking":
                    from ..docking.result import DockingResult

                    manifest = contained(root, "result.json")
                    if manifest.stat().st_size > 2 * 1024**2:
                        raise ValueError("Docking output report exceeds its typed limit.")
                    result = DockingResult.model_validate_json(manifest.read_text())
                    if (
                        any(artifact.name == p.diagnostic_artifact for p in result.poses)
                        or artifact.name == result.raw_pose_artifact
                        or (
                            artifact.name == result.pose_artifact
                            and not any(p.valid for p in result.poses)
                        )
                    ):
                        continue
                if (
                    job.request.operation == "diffsbdd"
                    and job.request.payload.mode == "inpaint"
                    and file.suffix.lower() == ".sdf"
                ):
                    manifest = contained(root, "result.json")
                    if manifest.stat().st_size > 2 * 1024**2:
                        raise ValueError("Generation output report exceeds its typed limit.")
                    result = json.loads(manifest.read_text())
                    if "core_verification" in result:
                        from ..diffsbdd.quality import validate_verification

                        evidence = validate_verification(result, job.request, root)
                        if file.name != evidence.qualified_artifact or not evidence.qualified_count:
                            continue
                if job.request.operation == "molecular_states" and file.suffix.lower() == ".sdf":
                    if file.name not in {"states.sdf", "conformers.sdf"} or not file.stat().st_size:
                        continue
                _, objects = self.preserve(job.id, file, kind)
                count += len(objects)
            except (ValueError, KeyError, OSError, ConflictError) as exc:
                errors.append({"artifact": artifact.name, "reason": str(exc)})
        if job.request.operation == "molecular_states" and not errors:
            from .state_sets import StateSets

            try:
                StateSets(self.store, self.assets).ingest(job, root)
            except (ValueError, KeyError, OSError, ConflictError) as exc:
                errors.append({"artifact": "state_set", "reason": str(exc)})
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
