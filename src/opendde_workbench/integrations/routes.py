"""Discover reusable models through the existing successful-job authority."""

import json

from ..artifacts import contained
from .contract import IntegratedTask
from .result import validate_result


def register_scientific_routes(app, store, settings):
    @app.get("/api/scientific/property-models")
    def models():
        selected = []
        # Bound enumeration; use the existing store rather than a competing model registry.
        with store.connect() as db:
            ids = [
                row["id"]
                for row in db.execute(
                    "SELECT id FROM jobs WHERE status='succeeded' "
                    "AND json_extract(request, '$.operation')='chemprop_train' "
                    "ORDER BY created_at DESC LIMIT 100"
                )
            ]
        for identifier in ids:
            job = store.get(identifier)
            if not isinstance(job.request, IntegratedTask):
                continue
            output = settings.state_dir / "jobs" / job.id / "output"
            try:
                report = contained(output, "result.json")
                if report.stat().st_size > 4 * 1024**2:
                    continue
                result = validate_result(
                    json.loads(report.read_text(encoding="utf-8")), job.request, output
                )
                if not result.model_artifact:
                    continue
                selected.append(
                    {
                        "job_id": job.id,
                        "name": job.request.name,
                        "activity_property": job.request.payload.activity_property,
                        "activity_unit": job.request.payload.activity_unit,
                        "sha256": result.artifact_sha256[result.model_artifact],
                    }
                )
            except (OSError, ValueError, KeyError):
                continue
        return {"models": selected}
