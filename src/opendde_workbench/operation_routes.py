"""Reusable input imports and typed results for utility operations."""

import json
from uuid import UUID

from fastapi import Depends, HTTPException, Query

from .artifacts import contained
from .assets import AssetKind
from .models import Status
from .native_import import import_document
from .research.outputs import OutputCatalog


def register_operations(app, store, assets, settings, mutation):
    output_catalog = OutputCatalog(store, assets)

    def completed(job_id):
        job = store.get(str(job_id))
        if not job:
            raise HTTPException(404, "Task not found.")
        if job.status != Status.SUCCEEDED:
            raise HTTPException(409, "Wait for the task to succeed.")
        return settings.state_dir / "jobs" / str(job_id)

    def preserve_file(job_id, file, kind):
        return output_catalog.preserve(job_id, file, kind)[0]

    @app.get("/api/research/indexing")
    def indexing():
        return output_catalog.recent()

    @app.post("/api/jobs/{job_id}/index-assets", dependencies=[Depends(mutation)])
    def index_outputs(job_id: UUID):
        root = completed(job_id)
        return output_catalog.index(store.get(str(job_id)), root / "output")

    @app.get("/api/jobs/{job_id}/result")
    def result(job_id: UUID):
        root = completed(job_id)
        try:
            path = contained(root / "output", "result.json")
            if path.stat().st_size > 25 * 1024**2:
                raise ValueError("Result exceeds the display size limit. Download the artifact.")
            value = json.loads(path.read_text())
            job = store.get(str(job_id))
            if job.request.operation in {"reference_import", "target_research"}:
                from .discovery.presentation import present_result

                try:
                    value = present_result(value, job, root / "output", store, assets)
                except (ValueError, TypeError, KeyError, OSError) as exc:
                    raise HTTPException(
                        422, "Research evidence is invalid or changed; inspect task files."
                    ) from exc
            if job.request.operation == "pose_quality":
                from .quality.result import validate_quality

                try:
                    validate_quality(value, job.request, root / "output")
                except (ValueError, TypeError, KeyError, OSError) as exc:
                    raise HTTPException(
                        422, "Pose quality evidence is invalid or changed."
                    ) from exc
            if job.request.operation == "antibody_number":
                from .antibodies.presentation import present_numbering

                try:
                    value = present_numbering(value, job, root / "output", store, assets)
                except (ValueError, TypeError, KeyError, OSError) as exc:
                    raise HTTPException(
                        422, "Antibody annotation evidence is invalid or changed."
                    ) from exc
            if job.request.operation == "library_screen":
                from .chemistry.screen_presentation import present_screen

                try:
                    value = present_screen(value, job, root / "output", store, assets)
                except (ValueError, TypeError, KeyError, OSError) as exc:
                    raise HTTPException(
                        422, "Library selection evidence is invalid or changed."
                    ) from exc
            if job.request.operation == "structure_prepare":
                from .receptors.preparation_presentation import present_preparation

                try:
                    value = present_preparation(value, job, root / "output", store, assets)
                except (ValueError, TypeError, KeyError, OSError) as exc:
                    raise HTTPException(
                        422, "Prepared structure evidence is invalid or changed."
                    ) from exc
            if job.request.operation == "receptor_ensemble":
                from .receptors.result import validate_result

                try:
                    validate_result(value, job.request, root / "output")
                except (ValueError, TypeError, KeyError) as exc:
                    raise HTTPException(
                        422,
                        "Receptor alignment evidence is invalid or changed; inspect task files.",
                    ) from exc
            if job.request.operation == "molecular_states":
                from .chemistry.result import validate_result

                try:
                    validate_result(value, job.request, root / "output")
                except (ValueError, TypeError, KeyError) as exc:
                    raise HTTPException(
                        422,
                        "Prepared molecular state evidence is invalid or changed; "
                        "inspect the task files.",
                    ) from exc
            if job.request.operation == "diffsbdd" and job.request.payload.mode == "inpaint":
                try:
                    if not isinstance(value, dict):
                        raise ValueError("Generation result must be a structured object.")
                    output_catalog.core_output(job_id, path, document=value)
                except (ValueError, KeyError, TypeError) as exc:
                    import logging

                    logging.getLogger(__name__).warning(
                        "invalid_core_result job_id=%s error_type=%s", job_id, type(exc).__name__
                    )
                    raise HTTPException(
                        422,
                        "Fixed-core result evidence is invalid or changed. "
                        "Inspect native files before reusing this task.",
                    ) from exc
            return value
        except FileNotFoundError as exc:
            raise HTTPException(
                404, "This task provides native files instead of a structured result."
            ) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/jobs/{job_id}/import", dependencies=[Depends(mutation)])
    def reuse(job_id: UUID, name: str = Query(min_length=1, max_length=500)):
        root = completed(job_id)

        def resolve_file(value, kind):
            if not isinstance(value, str) or not value.startswith("/job/"):
                raise ValueError("Native paths must refer to this task's managed files.")
            file = contained(root, value.removeprefix("/job/"))
            if file.stat().st_size > 25 * 1024**2:
                raise ValueError("Prepared file exceeds the managed upload limit.")
            return preserve_file(job_id, file, kind).id

        try:
            path = contained(root / "output", name)
            if path.suffix != ".json" or path.stat().st_size > 2 * 1024**2:
                raise ValueError("Choose an inference JSON smaller than2MiB.")
            docs = json.loads(path.read_text())
            if isinstance(docs, dict):
                docs = [docs]
            if not isinstance(docs, list) or not 1 <= len(docs) <= 20:
                raise ValueError("Import one to20 inference entries at a time.")
            return [import_document(doc, resolve_file) for doc in docs]
        except (ValueError, KeyError, TypeError, FileNotFoundError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/jobs/{job_id}/assets", dependencies=[Depends(mutation)], status_code=201)
    def preserve_artifact(
        job_id: UUID, kind: AssetKind, name: str = Query(min_length=1, max_length=500)
    ):
        root = completed(job_id)
        try:
            file = contained(root / "output", name)
            if file.stat().st_size > 25 * 1024**2:
                raise ValueError("Artifact exceeds the25MiB reusable-input limit.")
            return preserve_file(job_id, file, kind)
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/assets/{asset_id}/import", dependencies=[Depends(mutation)])
    def import_input(asset_id: UUID):
        try:
            asset = assets.get(asset_id)
            if asset.kind != "config" or asset.suffix != ".json" or asset.size > 2 * 1024**2:
                raise ValueError("Choose an OpenDDE inference JSON smaller than2MiB.")
            docs = json.loads(assets.path(asset).read_text(encoding="utf-8-sig"))
            if isinstance(docs, dict):
                docs = [docs]
            if not isinstance(docs, list) or not 1 <= len(docs) <= 20:
                raise ValueError("Import one to20 inference entries at a time.")

            def resolve(value, kind):
                if not isinstance(value, str) or not value.startswith("asset:"):
                    raise ValueError(
                        "Replace local paths with asset:<uploaded UUID> before importing."
                    )
                binding = assets.get(value[6:])
                if binding.kind != kind:
                    raise ValueError("Uploaded file type does not match the native field.")
                return binding.id

            return [import_document(doc, resolve) for doc in docs]
        except (ValueError, KeyError, TypeError, FileNotFoundError) as exc:
            raise HTTPException(422, str(exc)) from exc
