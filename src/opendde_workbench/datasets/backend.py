"""Dataset computations reuse the platform Worker and each actual scientific environment."""

import asyncio
import json
from pathlib import Path

from ..prepared_container import PreparedContainerBackend
from ..store import Store
from .bindings import resolve_source
from .integrity import verified

FILES = (
    "runner.py",
    "native_io.py",
    "native_library.py",
    "library_records.py",
    "library_database.py",
    "drugclip_encoder.py",
    "drugclip_index.py",
    "drugclip_pocket.py",
    "drugclip_retrieval.py",
    "retrieval_topk.py",
    "del_definition.py",
    "del_decoder_compat.py",
    "del_fastq.py",
    "native_del_library.py",
    "native_del_decode.py",
    "native_del_count.py",
    "del_count_table.py",
    "del_statistics.py",
    "native_del_analysis.py",
    "native_del_series.py",
    "native_del_model.py",
    "native_del_candidates.py",
    "native_del_followup.py",
    "native_docking.py",
)


class DatasetBackend(PreparedContainerBackend):
    def __init__(self, settings):
        self.store = Store(settings.state_dir / "jobs.sqlite3")
        super().__init__(
            settings,
            "datasets",
            Path(__file__).parent,
            tuple(name for name in FILES if name != "native_io.py"),
            self.configured_image,
            self.unselected_readiness,
            shared_sources={
                "platformnative_io.py": Path(__file__).with_name("native_io.py"),
                "recipes.json": Path(__file__).parent.parent / "integrations/recipes.json",
                "native_resources.py": Path(__file__).parent.parent
                / "integrations/native_resources.py",
                "docking_chemistry.py": Path(__file__).parent.parent / "docking/chemistry.py",
                "docking_options.py": Path(__file__).parent.parent / "docking/options.py",
                "docking_manifest.py": Path(__file__).parent.parent / "docking/manifest.py",
            },
        )

    def configured_image(self, settings):
        raise RuntimeError("Select the actual engine through a typed dataset task.")

    async def unselected_readiness(self, settings):
        raise RuntimeError("Readiness belongs to the task's actual scientific engine.")

    def image_for(self, job, directory):
        if job.request.payload.kind == "chemistry":
            from ..chemistry.runtime import configuration

            return configuration(self.settings)
        elif job.request.payload.kind == "gnina":
            from ..docking.runtime import configuration

            return configuration(self.settings)
        else:
            from ..integrations.runtime import configuration

            return configuration(self.settings, job.request.payload.kind)[0]

    def execution_arguments(self, job, directory):
        args = [
            "--env",
            "XDDE_PROGRAM=" + job.request.payload.kind,
            "--env",
            "WANDB_MODE=disabled",
            "--env",
            "HF_HUB_OFFLINE=1",
        ]
        integrity = {}
        for reference in job.request.sources:
            _, root, result = resolve_source(
                self.store, self.settings.state_dir, reference, full_hash=True
            )
            if root.is_symlink() or "," in str(root):
                raise ValueError("Scientific source mounts must be direct managed directories.")
            args += [
                "--mount",
                f"type=bind,source={root},target=/sources/{reference.job_id},readonly",
            ]
            integrity[str(reference.job_id)] = {
                item.name: {"sha256": item.sha256, "stamp": verified(root / item.name, item.sha256)}
                for item in result.artifacts
            }
        proof = directory / "source-integrity.json"
        proof.write_text(json.dumps(integrity), encoding="utf-8")
        args += [
            "--mount",
            f"type=bind,source={proof},target=/input/source-integrity.json,readonly",
        ]
        if job.request.options.device == "cuda":
            args += ["--gpus", "device=0"]
        if job.request.payload.kind == "drugclip":
            from ..integrations.native_resources import model_files
            from ..integrations.runtime import configuration
            from ..integrations.specs import PROGRAMS

            _, entry = configuration(self.settings, "drugclip")
            models = Path(entry["models"])
            if models.is_symlink() or "," in str(models):
                raise ValueError("Official model resources must belong to a managed directory.")
            manifest = model_files(models, PROGRAMS["drugclip"])
            proof = directory / "model-integrity.json"
            proof.write_text(
                json.dumps(
                    {
                        row["name"]: {
                            "sha256": row["sha256"],
                            "stamp": verified(models / row["name"], row["sha256"]),
                        }
                        for row in manifest["files"]
                    }
                ),
                encoding="utf-8",
            )
            args += [
                "--mount",
                f"type=bind,source={models},target=/models,readonly",
                "--mount",
                f"type=bind,source={proof},target=/input/model-integrity.json,readonly",
            ]
        return args

    async def prepare_execution_arguments(self, job, directory):
        arguments = await asyncio.to_thread(self.execution_arguments, job, directory)
        if self.store.get(job.id).status == "cancelling":
            raise RuntimeError("Task was cancelled while verifying its large scientific inputs.")
        return arguments
