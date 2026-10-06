"""Bounded definition exploration and lossless single-candidate SDF downloads."""

import json
from uuid import UUID

from fastapi import HTTPException, Query, Response

from ..artifacts import contained


def sdf_record(file, selected, budget=4 * 1024**2):
    record, total, lines = 0, 0, []
    with file.open("rb") as stream:
        while line := stream.readline(65537):
            if len(line) > 65536:
                raise ValueError("An SDF line exceeds its supported preview budget.")
            if record == selected:
                total += len(line)
                if total > budget:
                    raise ValueError("The selected structure exceeds its preview budget.")
                lines.append(line)
            if line.strip() == b"$$$$":
                if record == selected:
                    return b"".join(lines)
                record += 1
            if record > 500:
                break
    raise ValueError("The exact selected SDF record is missing or truncated.")


def register(app, completed):
    @app.get("/api/datasets/{job_id}/candidate-structure")
    def candidate_structure(job_id: UUID, compound: str = Query(min_length=1, max_length=240)):
        _, root, result, _ = completed(job_id)
        candidate = next((row for row in result.candidates if row.id == compound), None)
        if candidate is None or not candidate.artifact:
            raise HTTPException(404, "This candidate has no verified molecular structure.")
        try:
            content = sdf_record(contained(root, candidate.artifact), candidate.record)
        except (OSError, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc
        return Response(
            content,
            media_type="chemical/x-mdl-sdfile",
            headers={
                "Content-Disposition": 'attachment; filename="candidate.sdf"',
                "X-Content-Type-Options": "nosniff",
            },
        )

    @app.get("/api/datasets/{job_id}/definition")
    def definition(
        job_id: UUID,
        library: str = Query(default="", max_length=64),
        cycle: int = Query(default=0, ge=0, le=7),
        offset: int = Query(default=0, ge=0, le=20000),
        limit: int = Query(default=20, ge=1, le=100),
    ):
        _, root, result, _ = completed(job_id)
        if result.data_kind != "definition":
            raise HTTPException(422, "Choose a verified DEL library definition.")
        file = contained(root, "del-definition.json")
        if file.stat().st_size > 25 * 1024**2:
            raise HTTPException(422, "The retained DEL definition exceeds its supported budget.")
        value = json.loads(file.read_bytes())
        chosen = library or next(iter(value["libraries"]))
        entry = value["libraries"].get(chosen)
        if entry is None or cycle >= len(entry["bb_sets"]):
            raise HTTPException(422, "Choose an actually defined library and building-block cycle.")
        block_set = entry["bb_sets"][cycle]["bb_set_name"]
        rows = value["building_blocks"][block_set]
        return {
            "library": chosen,
            "cycles": entry["bb_sets"],
            "barcode_schema": entry["barcode_schema"],
            "rows": rows[offset : offset + limit],
            "total": len(rows),
            "offset": offset,
            "has_more": offset + limit < len(rows),
        }
