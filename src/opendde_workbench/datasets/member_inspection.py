"""Readonly native member previews and explicit preservation in the existing asset authority."""

import hashlib
import sqlite3
from urllib.parse import urlencode
from uuid import UUID

from fastapi import Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from ..research.contracts import ScientificObject, VersionInput
from ..research.storage import ScientificStore
from .member_structure import indexed_structure


class PreserveMember(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    member_id: str = Field(min_length=1, max_length=160, pattern=r"^[^\x00-\x1f\x7f]+$")
    report_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


def register(app, store, assets, mutation, completed):
    scientific = ScientificStore(store, assets)

    def selected(job_id, member_id, expected=None):
        job, root, result, digest = completed(job_id)
        if expected is not None and expected != digest:
            raise HTTPException(409, "The selected research result changed. Select it again.")
        try:
            row, content = indexed_structure(root, result, member_id)
        except (ValueError, sqlite3.Error) as exc:
            raise HTTPException(422, "The indexed molecular record cannot be verified.") from exc
        return job, row, content, digest

    @app.get("/api/datasets/{job_id}/members/detail")
    def detail(job_id: UUID, member_id: str = Query(min_length=1, max_length=160)):
        job, row, content, digest = selected(job_id, member_id)
        return {
            "id": row["id"],
            "label": row["display_name"] or row["id"],
            "supplier": row["supplier"],
            "geometry": "unbound_conformer",
            "report_sha256": digest,
            "sha256": hashlib.sha256(content).hexdigest(),
            "url": f"/api/datasets/{job.id}/members/structure?"
            + urlencode({"member_id": member_id, "report_sha256": digest}),
        }

    @app.get("/api/datasets/{job_id}/members/structure")
    def structure(
        job_id: UUID,
        member_id: str = Query(min_length=1, max_length=160),
        report_sha256: str = Query(pattern=r"^[0-9a-f]{64}$"),
    ):
        _, _, content, _ = selected(job_id, member_id, report_sha256)
        return Response(
            content,
            media_type="chemical/x-mdl-molfile",
            headers={
                "X-Structure-Format": "mol",
                "X-Structure-Geometry": "unbound_conformer",
                "Content-Disposition": 'attachment; filename="indexed-member.mol"',
            },
        )

    @app.post(
        "/api/datasets/{job_id}/members/preserve",
        response_model=ScientificObject,
        dependencies=[Depends(mutation)],
    )
    def preserve(job_id: UUID, value: PreserveMember):
        job, row, content, digest = selected(job_id, value.member_id, value.report_sha256)
        identity = hashlib.sha256((job.id + digest + row["id"]).encode()).hexdigest()
        key = "indexed-member:" + identity
        try:
            previous = scientific.get_for_key(key)
        except KeyError:
            previous = None
        if previous is not None:
            try:
                scientific.validate_reference(previous.reference)
            except (ValueError, FileNotFoundError) as exc:
                raise HTTPException(422, "The saved molecular file cannot be verified.") from exc
            if previous.reference.sha256 != hashlib.sha256(content).hexdigest():
                raise HTTPException(409, "The saved molecular record differs from its source.")
            return previous
        try:
            asset = assets.save("indexed-member-" + identity[:20] + ".mol", "ligand", content)
            return scientific.create(
                VersionInput(
                    asset_id=asset.id,
                    kind="molecule",
                    label=(row["display_name"] or row["id"])[:120],
                    relation="prepared_from",
                    notes="Original indexed unbound conformer.",
                ),
                key,
                source_job=UUID(job.id),
                validation="native_prepared",
            )
        except (ValueError, KeyError) as exc:
            raise HTTPException(422, "The molecular record could not be saved.") from exc
