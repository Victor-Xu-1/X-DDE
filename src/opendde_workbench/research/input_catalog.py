"""Searchable, paged inputs over existing immutable upload and version authorities."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import HTTPException, Query
from pydantic import BaseModel

from ..assets import EXTENSIONS, Asset, AssetKind
from ..dataset_inputs import DATA_EXTENSIONS
from ..scientific_objects import MoleculeRef
from .contracts import ScientificObject


class InputChoice(BaseModel):
    key: str
    origin: Literal["upload", "saved"]
    label: str
    created_at: str
    asset: Asset
    reference: MoleculeRef
    version: ScientificObject | None = None


class InputCatalog(BaseModel):
    items: list[InputChoice]
    selected: InputChoice | None
    total: int
    offset: int
    limit: int


def input_page(
    scientific, kind, formats, query="", scope="records", selected=None, offset=0, limit=25
):
    formats = tuple(dict.fromkeys(formats))
    supported = {**EXTENSIONS, **DATA_EXTENSIONS}.get(kind, set())
    if not formats or any(suffix not in supported for suffix in formats):
        raise ValueError("Choose supported input formats.")
    suffix_sql = ",".join("?" for _ in formats)
    sql = (
        "WITH choices AS (SELECT 'file:'||a.id AS choice_key, 'upload' AS origin, "
        "a.name AS label, a.created_at AS choice_time, a.*, NULL AS body FROM assets a "
        f"WHERE a.kind=? AND a.suffix IN ({suffix_sql})"
    )
    parameters = [kind, *formats]
    object_kind = {"structure": "structure", "ligand": "molecule", "sequences": "sequence"}.get(
        kind
    )
    if scope == "records" and object_kind:
        sql += (
            " UNION ALL SELECT 'version:'||s.id, 'saved', "
            "json_extract(s.body,'$.label'), s.created_at, a.*, s.body "
            "FROM scientific_objects s JOIN assets a ON a.id=s.asset_id "
            f"WHERE a.kind=? AND a.suffix IN ({suffix_sql}) "
            "AND json_extract(s.body,'$.kind')=?"
        )
        parameters += [kind, *formats, object_kind]
    sql += ") "
    where, values = "", []
    if query.strip():
        where = " WHERE instr(lower(label),lower(?))>0 OR instr(lower(name),lower(?))>0"
        values = [query.strip(), query.strip()]
    with scientific.store.connect() as db:
        db.execute("BEGIN")
        total = db.execute(
            sql + "SELECT COUNT(*) FROM choices" + where, parameters + values
        ).fetchone()[0]
        rows = db.execute(
            sql
            + "SELECT * FROM choices"
            + where
            + " ORDER BY choice_time DESC, choice_key DESC LIMIT ? OFFSET ?",
            parameters + values + [limit, offset],
        ).fetchall()
        selected_row = (
            db.execute(
                sql + "SELECT * FROM choices WHERE choice_key=?", parameters + [selected]
            ).fetchone()
            if selected
            else None
        )

    def choice(row):
        asset = Asset.model_validate({field: row[field] for field in Asset.model_fields})
        version = ScientificObject.model_validate_json(row["body"]) if row["body"] else None
        reference = (
            version.reference
            if version
            else (MoleculeRef(asset_id=UUID(asset.id), sha256=asset.sha256, record=0, conformer=0))
        )
        return InputChoice(
            key=row["choice_key"],
            origin=row["origin"],
            label=row["label"],
            created_at=row["choice_time"],
            asset=asset,
            reference=reference,
            version=version,
        )

    return InputCatalog(
        items=[choice(row) for row in rows],
        selected=choice(selected_row) if selected_row else None,
        total=total,
        offset=offset,
        limit=limit,
    )


def register_input_catalog(app, scientific):
    @app.get("/api/research/input-catalog", response_model=InputCatalog)
    def listing(
        kind: AssetKind,
        formats: Annotated[list[str], Query(min_length=1, max_length=8)],
        q: str = Query("", max_length=180),
        scope: Literal["records", "files"] = "records",
        selected: str | None = Query(None, max_length=44),
        offset: int = Query(0, ge=0, le=1000000),
        limit: int = Query(25, ge=1, le=50),
    ):
        if selected:
            prefix, separator, identifier = selected.partition(":")
            try:
                if not separator or prefix not in {"file", "version"}:
                    raise ValueError()
                selected = prefix + ":" + str(UUID(identifier))
            except ValueError as exc:
                raise HTTPException(422, "Choose an existing input.") from exc
        try:
            return input_page(scientific, kind, formats, q, scope, selected, offset, limit)
        except ValueError as exc:
            raise HTTPException(422, "Choose supported input formats.") from exc
