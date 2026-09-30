"""Translate validated workbench requests to the pinned OpenDDE CLI contract."""

from .prediction import Prediction
from .requests import TaskRequest


def native_arguments(request: TaskRequest, checkpoint_path: str | None = None) -> list[str]:
    operation = request.operation
    if operation == "doctor":
        # Use the lightweight public entry point even if inference dependencies are broken.
        return ["python", "-c", "from runner.cli import opendde_cli; opendde_cli()", "doctor"]
    if operation in {"properties", "inspect", "resources", "json", "msa", "mt", "prep"}:
        return ["python", "/adapter/native_task.py"]
    if operation != "predict":
        raise ValueError("This operation does not use the OpenDDE CLI adapter.")
    p = request.parameters
    cli = [
        "python",
        "-m",
        "runner.batch_inference",
        "pred",
        "-i",
        "/job/input.json",
        "-o",
        "/job/output",
    ]
    options = {
        "device": p.device,
        "dtype": p.dtype,
        "sample": p.samples,
        "step": p.steps,
        "cycle": p.cycles,
        "seeds": ",".join(map(str, p.seeds)),
        "use_msa": p.feature_mode != "none",
        "use_template": p.use_template,
        "use_rna_msa": p.use_rna_msa,
        "use_tfg_guidance": p.tfg,
        "need_atom_confidence": p.atom_confidence,
        "trimul_kernel": p.trimul_kernel,
        "triatt_kernel": p.triatt_kernel,
        "enable_cache": p.enable_cache,
        "enable_fusion": p.enable_fusion,
        "enable_tf32": p.enable_tf32,
        "deterministic": p.deterministic,
    }
    if checkpoint_path:
        options["load_checkpoint_path"] = checkpoint_path
    elif p.model == "abag":
        options["load_checkpoint_path"] = "/opendde/checkpoint/opendde_abag.pt"
    if p.distributed:
        # torchrun owns rank assignment; Docker exposes only the selected devices.
        cli = [
            "torchrun",
            "--standalone",
            f"--nproc_per_node={len(p.gpu_ids)}",
            "--module",
            *cli[2:],
        ]
        options.update(
            foldcp_mode="distributed",
            foldcp_size_dp=1,
            foldcp_size_cp=len(p.gpu_ids),
            foldcp_devices=",".join(map(str, p.gpu_ids)),
            foldcp_metrics_jsonl="/job/output/foldcp-metrics.jsonl",
        )
    for key, value in options.items():
        cli.extend(["--" + key, str(value).lower() if isinstance(value, bool) else str(value)])
    if p.use_rna_msa:
        cli += ["--nhmmer_n_cpu", str(p.search_cpus)]
    return cli


def network_enabled(request: TaskRequest) -> bool:
    return (
        request.allow_network
        if request.operation == "resources"
        else (isinstance(request, Prediction) and request.parameters.allow_network)
    )


def needs_gpu(request: TaskRequest) -> bool:
    return (
        (request.operation == "predict" and request.parameters.device == "cuda")
        or (request.operation == "harness" and request.tool in {"esm", "esm2", "mpnn", "fold"})
        or (request.operation == "docking" and request.options.use_gpu)
        or (
            request.operation == "diffsbdd"
            and request.payload.mode in {"generate", "inpaint", "diversify", "optimize"}
        )
    )
