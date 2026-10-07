"""Use the existing bounded container lifecycle, queue, recovery and scientific snapshots."""

from pathlib import Path

from ..prepared_container import PreparedContainerBackend
from ..store import Store
from .bindings import trained_model
from .runtime import configuration, readiness
from .specs import PROGRAMS

FILES = (
    "runner.py",
    "native_io.py",
    "native_resources.py",
    "native_deepternary.py",
    "native_boltz.py",
    "native_reinvent.py",
    "native_ligandmpnn.py",
    "native_boltzgen.py",
    "native_scaffold.py",
    "native_structure.py",
    "native_openmm.py",
    "native_apbs.py",
    "native_chemprop.py",
    "native_validation.py",
    "native_plip.py",
    "plip_coordinates.py",
    "recipes.json",
)


class ScientificBackend(PreparedContainerBackend):
    def __init__(self, settings, identifier):
        self.program = identifier
        root = Path(__file__).parent.parent
        shared = {}
        if identifier == "deepternary":
            shared = {
                "native_proximity_" + name + ".py": root / "proximity" / ("native_" + name + ".py")
                for name in (
                    "chemistry",
                    "regions",
                    "partners",
                    "graphs",
                    "prediction",
                    "quality",
                    "outputs",
                )
            }
            shared.update(
                {
                    "native_proximity_options.py": root / "proximity/options.py",
                    "native_proximity_graph_identity.py": root / "proximity/graph_identity.py",
                    "native_selection.py": root / "receptors/native_selection.py",
                    "preparation_options.py": root / "receptors/preparation_options.py",
                }
            )
        super().__init__(
            settings,
            identifier,
            Path(__file__).parent,
            FILES,
            lambda config: configuration(config, identifier)[0],
            lambda config: readiness(config, identifier),
            shared_sources=shared,
        )

    def execution_arguments(self, job, directory):
        args = [
            "--env",
            "XDDE_PROGRAM=" + self.program,
            "--env",
            "WANDB_MODE=disabled",
            "--env",
            "HF_HUB_OFFLINE=1",
            "--env",
            "TRANSFORMERS_OFFLINE=1",
            "--env",
            "MPLCONFIGDIR=/tmp/matplotlib",
            "--env",
            "NUMBA_CACHE_DIR=/tmp/numba",
        ]
        if job.request.options.device == "cuda":
            args += ["--gpus", "device=0"]
        if PROGRAMS[self.program]["models"]:
            _, metadata = configuration(self.settings, self.program)
            root = Path(metadata["models"])
            if root.is_symlink() or "," in str(root):
                raise ValueError("Native model directories must be real managed paths.")
            args += [
                "--mount",
                f"type=bind,source={root},target=/models,readonly",
                "--env",
                "HF_HOME=/models/huggingface",
                "--env",
                "BOLTZ_CACHE=/models",
            ]
        if job.request.operation == "chemprop_predict":
            model = trained_model(
                self.settings.state_dir,
                Store(self.settings.state_dir / "jobs.sqlite3"),
                job.request.payload,
            )
            if "," in str(model):
                raise ValueError(
                    "Trained model path cannot be represented by the native mount contract."
                )
            args += [
                "--mount",
                f"type=bind,source={model},target=/input/property-model.pt,readonly",
            ]
        return args
