"""Thin preview orchestration; native execution stays in Chemistry/GNINA and the shared queue."""

import json

from ..artifacts import contained
from ..chemistry.minimization_contract import MoleculeMinimizeTask
from ..chemistry.minimization_options import MinimizationOptions
from ..chemistry.minimization_result import validate_minimization
from ..docking.contract import DockingTask
from ..docking.options import DockingOptions
from ..docking.result import DockingResult
from ..models import Status
from .pose_sources import PoseSources


class PoseMinimization:
    def __init__(self, store, assets, settings):
        self.store, self.settings = store, settings
        self.sources = PoseSources(store, assets, settings)

    def task(self, value):
        ligand = self.sources.resolve(value.source)
        if value.method == "receptor":
            receptor = self.sources.resolve(value.receptor, receptor=True)
            return DockingTask(
                name="Receptor-bound pose minimization",
                mode="minimize",
                receptor=receptor,
                ligand=ligand,
                pose_frame=receptor,
                pose_coordinate_basis=value.coordinate_basis,
                options=DockingOptions(minimize_iters=value.max_iterations, num_modes=1),
                scientific_inputs=[ligand, receptor],
            )
        return MoleculeMinimizeTask(
            molecule=ligand,
            options=MinimizationOptions(
                force_field=value.method, max_iterations=value.max_iterations
            ),
            scientific_inputs=[ligand],
        )

    def save(self, job_id):
        job = self.store.get(str(job_id))
        if not job or job.status != Status.SUCCEEDED:
            raise ValueError("Wait for successful minimization before loading the saved pose.")
        root = self.settings.state_dir / "jobs" / job.id / "output"
        file = contained(root, "result.json")
        if file.stat().st_size > 2 * 1024**2:
            raise ValueError("Pose result exceeds its bounded report size.")
        value = json.loads(file.read_text())
        energy, native_score, receptor = None, None, None
        if job.request.operation == "molecule_minimize":
            result = validate_minimization(value, job.request, root)
            artifact = result.artifact
            energy = {
                "before": result.energy_before,
                "after": result.energy_after,
                "unit": result.energy_unit,
                "method": result.method,
                "converged": result.converged,
            }
        elif job.request.operation == "docking" and job.request.mode == "minimize":
            result = DockingResult.model_validate(value)
            if (
                result.mode != "minimize"
                or result.ligand != job.request.ligand
                or result.receptor != job.request.receptor
            ):
                raise ValueError("Minimized pose differs from its exact receptor/input frame.")
            pose = next((p for p in result.poses if p.valid and p.artifact), None)
            if pose is None:
                raise ValueError(
                    "No qualified minimized pose was returned; keep the previous pose."
                )
            artifact = pose.artifact
            score = next(s for s in pose.scores if s.name == "minimizedAffinity")
            native_score = {
                "value": score.value,
                "unit": "kcal/mol",
                "method": "GNINA",
                "scoring": result.options.scoring,
                "scope": "whole_pose",
            }
            receptor = job.request.receptor.model_dump(mode="json")
        else:
            raise ValueError("This task is not a preview pose minimization.")
        _, versions = self.sources.outputs.preserve(job.id, contained(root, artifact), "ligand")
        if len(versions) != 1 or versions[0].reference.record:
            raise ValueError("Saved minimization output must be exactly one pose.")
        return {
            "job_id": job.id,
            "pose": versions[0].model_dump(mode="json"),
            "energy": energy,
            "native_score": native_score,
            "receptor": receptor,
        }
