"""Invoke the pinned, released Mol-1 CLI; preserve its actual native outputs."""

import json
import os
from pathlib import Path

from native_io import execute
from native_mol1_results import collect_results


def arguments(request, specification, output):
    payload = request["payload"]
    return [
        "mol",
        "pred",
        "--input",
        specification,
        "--out_dir",
        output,
        "--model_name",
        "mol-1-base",
        "--load_checkpoint_path",
        "/models/mol-1-base.pt",
        "--device",
        request["options"]["device"],
        "--dtype",
        payload["dtype"],
        "--sample",
        payload["samples"],
        "--cycle",
        payload["cycles"],
        "--step",
        payload["steps"],
        "--seeds",
        ",".join(str(seed) for seed in [request["options"]["seed"], *payload["additional_seeds"]]),
        "--use_seeds_in_json",
        "true",
        "--use_msa",
        str(payload["feature_mode"] != "none").lower(),
        "--use_template",
        str(payload["use_template"]).lower(),
        "--use_rna_msa",
        str(payload["use_rna_msa"]).lower(),
        "--msa_pair_as_unpair",
        str(payload["msa_pair_as_unpair"]).lower(),
        "--need_atom_confidence",
        str(payload["atom_confidence"]).lower(),
        "--enable_tf32",
        str(payload["enable_tf32"]).lower(),
        "--enable_fusion",
        str(payload["enable_fusion"]).lower(),
        "--triatt_kernel",
        "torch",
        "--trimul_kernel",
        "torch",
        "--diffusion_cache_mode",
        payload["diffusion_cache_mode"],
        "--infer_setting.chunk_size",
        payload["attention_chunk"],
        "--model.msa_module.msa_chunk_size",
        payload["msa_chunk"],
        "--infer_setting.sample_diffusion_chunk_size",
        payload["sample_chunk"],
    ]


def run(request):
    payload = request["payload"]
    if payload["feature_mode"] == "search" and not payload["allow_network"]:
        raise ValueError("Remote sequence search requires explicit task permission.")
    raw = Path("/output/native")
    raw.mkdir()
    resources = Path("/tmp/mol1-resources")
    resources.mkdir()
    for name in ("common", "search_database"):
        source = Path("/models") / name
        if source.is_symlink() or not source.is_dir():
            raise ValueError("Install the verified Mol-1 reference data before prediction.")
        (resources / name).symlink_to(source, target_is_directory=True)
    os.environ["MOL_ROOT_DIR"] = str(resources)
    os.environ["LAYERNORM_TYPE"] = "torch"
    specification = Path("/input/specification.json")
    document = json.loads(specification.read_text())
    if len(document) != 1 or document[0]["modelSeeds"] != [
        request["options"]["seed"],
        *payload["additional_seeds"],
    ]:
        raise ValueError("The native compiled Mol-1 input differs from its reviewed seeds.")
    command = arguments(request, specification, raw)
    (raw / "mol1-method.json").write_text(
        json.dumps(
            {
                "engine": "Mol-1 base",
                "source_revision": "e6e64866ee89640a91cef7ee777a85f1d8be03bb",
                "model": "mol-1-base",
                "geometry_constraints": "unreleased_variant_not_available",
                "layernorm": "torch",
                "triangle_kernels": "torch",
                "network_authorized": payload["allow_network"],
                "arguments": [str(value) for value in command],
                "scope": "structure_prediction_not_measured_binding_or_affinity",
            }
        )
    )
    execute(command)
    collect_results(request, document[0]["name"], raw)
