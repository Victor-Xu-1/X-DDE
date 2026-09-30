"""Typed immutable conditions and dry-run support checks share the usual CSRF boundary."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query
from pydantic import ConfigDict

from ..requests import TaskRequest
from ..scientific_objects import MoleculeRef, ScientificModel
from ..store import ConflictError
from .constraint_contract import ConstraintReference, ConstraintSet
from .constraint_records import ConstraintRecords


class SupportInput(ScientificModel):
    model_config = ConfigDict(extra="forbid")
    reference: ConstraintReference
    request: TaskRequest


def register_constraints(app, store, assets, settings, mutation):
    records = ConstraintRecords(store, assets, settings)

    def execute(fn):
        try:
            return fn()
        except KeyError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ConflictError as exc:
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except OSError as exc:
            raise HTTPException(
                422, "Constraint evidence could not be read. Refresh the input versions and retry."
            ) from exc

    @app.get("/api/research/constraints/schema")
    def schema():
        return {"schema_version": 1, "input": ConstraintSet.model_json_schema()}

    @app.get("/api/research/constraints")
    def listing(
        limit: int = Query(100, ge=1, le=200),
        offset: int = Query(0, ge=0, le=10000),
        asset_id: UUID | None = None,
        record: int = Query(0, ge=0, le=499),
        conformer: int = Query(0, ge=0, le=999),
        version_id: UUID | None = None,
    ):
        def load():
            if not asset_id:
                if version_id or record or conformer:
                    raise ValueError("A version/record filter requires its asset.")
                return records.list(limit, offset)
            asset = assets.get(asset_id)
            ref = MoleculeRef(
                asset_id=asset_id,
                sha256=asset.sha256,
                record=record,
                conformer=conformer,
                version_id=version_id,
            )
            return records.list(limit, offset, ref)

        return execute(load)

    @app.get("/api/research/constraints/{constraint_id}")
    def detail(constraint_id: UUID):
        return execute(lambda: records.get(constraint_id))

    @app.post("/api/research/constraints", status_code=201, dependencies=[Depends(mutation)])
    def save(value: ConstraintSet, idempotency_key: Annotated[UUID, Header()]):
        return execute(lambda: records.save(value, idempotency_key))

    @app.post("/api/research/constraint-support", dependencies=[Depends(mutation)])
    def support(value: SupportInput):
        return execute(lambda: records.preview(value.reference, value.request))

    @app.get("/api/jobs/{job_id}/constraints")
    def receipt(job_id: UUID):
        import json

        from ..artifacts import contained

        job = store.get(str(job_id))
        if not job:
            raise HTTPException(404, "Task not found.")
        reference = getattr(job.request, "constraints", None)
        if not reference:
            return None
        file = settings.state_dir / "jobs" / job.id / "constraint-execution.json"
        if not file.exists():
            return {"state": "not_started", "reference": reference.model_dump(mode="json")}

        def load():
            from .constraint_contract import ConstraintExecution

            verified = contained(file.parent, file.name)
            if verified.stat().st_size > 2 * 1024**2:
                raise ValueError("Constraint execution receipt exceeds its limit.")
            result = ConstraintExecution.model_validate_json(verified.read_text())
            if result.reference != reference or result.operation != job.request.operation:
                raise ValueError("Constraint receipt and task reference differ.")
            body = result.document.model_dump_json()
            import hashlib

            if hashlib.sha256(body.encode()).hexdigest() != reference.sha256:
                raise ValueError("Frozen constraint document differs from its recorded digest.")
            from .constraint_compile import compile_constraints

            execution = file.parent / "execution.json"
            # Old frozen receipts must retain their original support claims. Current
            # native launches record the verification profile before executing.
            core_check = False
            if execution.is_file():
                verified_execution = contained(execution.parent, execution.name)
                if verified_execution.stat().st_size > 2 * 1024**2:
                    raise ValueError("Execution evidence exceeds its limit.")
                core_check = (
                    json.loads(verified_execution.read_text()).get("core_verification")
                    == "rdkit_fixed_core_v1"
                )
            expected = compile_constraints(
                result.document,
                reference,
                job.request,
                records.regions,
                fixed_core_check=core_check,
            )
            if expected != result:
                raise ValueError(
                    "Constraint receipt parameters or support differ from the actual task."
                )
            return {"state": "captured_for_execution", **json.loads(result.model_dump_json())}

        return execute(load)

    return records
