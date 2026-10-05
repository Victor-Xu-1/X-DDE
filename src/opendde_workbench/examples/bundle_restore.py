"""Validate in isolated state, then atomically merge without changing existing records."""

import shutil
import tempfile
from dataclasses import replace
from pathlib import Path
from uuid import UUID

from ..assets import AssetStore
from ..store import ConflictError, Store
from .bundle_archive import read_archive, safe_path, sha256
from .bundle_projection import TABLES
from .bundle_sources import archive_sources
from .catalogue import FILES


def allowed_files(rows):
    allowed = {"public-example-cache/" + spec.sha256 for spec in FILES.values()}
    allowed.update(f"assets/{row['id']}/content{row['suffix']}" for row in rows["assets"])
    for row in rows["jobs"]:
        UUID(row["id"])
    return allowed


def restore_bundle(archive, settings, expected_sha, checkpoint=lambda: None):
    from ..api import create_app
    from .bundle import catalogue_digest, verify_examples

    state = settings.state_dir
    state.mkdir(parents=True, exist_ok=True)
    # Register schema through its existing owners; no application lifespan or workers start.
    create_app(settings)
    store = Store(state / "jobs.sqlite3")
    created = []
    with tempfile.TemporaryDirectory(prefix="case-import-", dir=state) as directory:
        staging = Path(directory)
        manifest = read_archive(archive, staging, expected_sha)
        rows = manifest.get("records", {})
        selected = None
        if manifest.get("catalogue_sha256") != catalogue_digest():
            from .catalogue_profiles import compatible_modules

            selected = compatible_modules(manifest.get("catalogue_sha256"))
        if set(rows) != set(TABLES) or sum(map(len, rows.values())) > 5000:
            raise ValueError(
                "The bundle must match the reviewed current catalogue and record schema."
            )
        permitted = allowed_files(rows)
        jobs = {row["id"] for row in rows["jobs"]}
        for name in manifest["files"]:
            parts = name.split("/")
            if name not in permitted and not (
                len(parts) >= 4
                and parts[0] == "jobs"
                and parts[1] in jobs
                and (
                    parts[2] == "output"
                    or parts[2:] == ["analysis", "workbench-analysis.json"]
                    or len(parts) == 5
                    and parts[2:4] == ["analysis", "workbench-aligned"]
                    and parts[4].endswith(".cif")
                )
            ):
                raise ValueError("Bundle contains a file outside its scientific case inventory.")
        if (
            any(row["status"] != "succeeded" for row in rows["jobs"])
            or any(row["state"] != "succeeded" for row in rows["workflow_runs"])
            or any(
                row["state"] != "validated" or row["task_id"] is not None
                for row in rows["design_plans"]
            )
        ):
            raise ValueError("Historical cases cannot enqueue tasks, agents or workflows.")
        # Validate all records and evidence in isolated state before touching user data.
        stage_store = Store(staging / "jobs.sqlite3")
        create_app(replace(settings, state_dir=staging))
        with stage_store.connect() as scratch:
            for table in TABLES:
                columns = {
                    row["name"] for row in scratch.execute("PRAGMA table_info(" + table + ")")
                }
                for row in rows[table]:
                    if set(row) != columns or any(
                        not isinstance(value, (str, int, float, type(None)))
                        for value in row.values()
                    ):
                        raise ValueError("Unexpected case record fields or values.")
                    keys = list(row)
                    scratch.execute(
                        "INSERT INTO "
                        + table
                        + "("
                        + ",".join(keys)
                        + ") VALUES("
                        + ",".join("?" for _ in keys)
                        + ")",
                        tuple(row[key] for key in keys),
                    )
        recovered_sources = {}
        for row in rows["jobs"]:
            job = stage_store.get(row["id"])
            output = staging / "jobs" / job.id / "output"
            for path in archive_sources(job, output, recover=True).values():
                name = path.relative_to(staging).as_posix()
                if name not in manifest["files"]:
                    recovered_sources[name] = {"sha256": sha256(path)}
        summary = (
            verify_examples(replace(settings, state_dir=staging))
            if selected is None
            else verify_examples(replace(settings, state_dir=staging), selected)
        )
        stage_assets = AssetStore(stage_store, staging / "assets")
        for row in rows["jobs"]:
            job = stage_store.get(row["id"])
            job_root = staging / "jobs" / job.id
            bindings = stage_assets.snapshot(job.request, job_root)
            (job_root / "request.json").write_text(job.request.model_dump_json())
            if hasattr(job.request, "inference_input"):
                import json

                (job_root / "input.json").write_text(
                    json.dumps(job.request.inference_input(job.id, bindings))
                )
        checkpoint()
        try:
            with store.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                pending = []
                for table in TABLES:
                    columns = [
                        row["name"] for row in db.execute("PRAGMA table_info(" + table + ")")
                    ]
                    primary = [
                        row["name"]
                        for row in db.execute("PRAGMA table_info(" + table + ")")
                        if row["pk"]
                    ]
                    for row in rows[table]:
                        if set(row) != set(columns):
                            raise ValueError("Unexpected case record fields.")
                        old = db.execute(
                            "SELECT * FROM "
                            + table
                            + " WHERE "
                            + " AND ".join(key + "=?" for key in primary),
                            tuple(row[key] for key in primary),
                        ).fetchone()
                        if old is not None and dict(old) != row:
                            raise ConflictError(
                                "Public case restoration never overwrites an existing record."
                            )
                        if old is None:
                            pending.append((table, columns, row))
                for name, evidence in {**manifest["files"], **recovered_sources}.items():
                    checkpoint()
                    target = safe_path(state, name)
                    if target.exists():
                        if not target.is_file() or sha256(target) != evidence["sha256"]:
                            raise ConflictError(
                                "A case file conflicts with existing scientific data."
                            )
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(safe_path(staging, name), target)
                        created.append(target)
                for table, _, row in pending:
                    if table != "jobs":
                        continue
                    for path in (staging / "jobs" / row["id"]).rglob("*"):
                        if not path.is_file():
                            continue
                        name = path.relative_to(staging).as_posix()
                        if name in manifest["files"]:
                            continue
                        target = safe_path(state, name)
                        if target.exists():
                            if sha256(target) != sha256(path):
                                raise ConflictError(
                                    "Existing task input differs from its historical request."
                                )
                        else:
                            target.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copyfile(path, target)
                            created.append(target)
                for table, columns, row in pending:
                    db.execute(
                        "INSERT INTO "
                        + table
                        + "("
                        + ",".join(columns)
                        + ") VALUES("
                        + ",".join("?" for _ in columns)
                        + ")",
                        tuple(row[key] for key in columns),
                    )

        except Exception:
            for path in reversed(created):
                path.unlink(missing_ok=True)
            raise
    return summary
