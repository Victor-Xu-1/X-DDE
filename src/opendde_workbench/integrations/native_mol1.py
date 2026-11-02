"""Invoke the pinned public Mol-1 inference API and preserve actual native outputs."""

import copy
import json
import os
from pathlib import Path

from native_io import digest, input_file
from native_mol1_bonds import translate_file_endpoints
from native_mol1_results import collect_results


def inference_options(request, specification, output):
    payload = request["payload"]
    return {
        "json_file": str(specification),
        "out_dir": str(output),
        "model_name": "mol-1-base",
        "load_checkpoint_path": "/models/mol-1-base.pt",
        "device": request["options"]["device"],
        "dtype": payload["dtype"],
        "n_sample": payload["samples"],
        "n_cycle": payload["cycles"],
        "n_step": payload["steps"],
        "seeds": [request["options"]["seed"], *payload["additional_seeds"]],
        "use_seeds_in_json": True,
        "use_msa": payload["feature_mode"] != "none",
        "use_template": payload["use_template"],
        "use_rna_msa": payload["use_rna_msa"],
        "need_atom_confidence": payload["atom_confidence"],
        "enable_tf32": payload["enable_tf32"],
        "enable_fusion": payload["enable_fusion"],
        "triatt_kernel": "torch",
        "trimul_kernel": "torch",
        "memory_settings": {
            "msa_pair_as_unpair": payload["msa_pair_as_unpair"],
            "diffusion_cache_mode": payload["diffusion_cache_mode"],
            "infer_setting.chunk_size": payload["attention_chunk"],
            "model.msa_module.msa_chunk_size": payload["msa_chunk"],
            "infer_setting.sample_diffusion_chunk_size": payload["sample_chunk"],
        },
    }


def run(request):
    payload = request["payload"]
    for item in request["inputs"]:
        # Shared hash/path verification, including repeated MSA/template roles.
        input_file({"inputs": [item]}, item["role"])
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
    snapshot = Path("/input/specification.json")
    document = json.loads(snapshot.read_text())
    if len(document) != 1 or document[0]["modelSeeds"] != [
        request["options"]["seed"],
        *payload["additional_seeds"],
    ]:
        raise ValueError("The native compiled Mol-1 input differs from its reviewed seeds.")
    native_input = copy.deepcopy(document)
    correspondence = translate_file_endpoints(request, native_input)
    preparation = raw / "prepared-input"
    preparation.mkdir()
    specification = preparation / "input.json"
    specification.write_text(json.dumps(native_input, allow_nan=False))
    options = inference_options(request, specification, raw)
    (raw / "mol1-method.json").write_text(
        json.dumps(
            {
                "engine": "Mol-1 base",
                "source_revision": "e6e64866ee89640a91cef7ee777a85f1d8be03bb",
                "model": "mol-1-base",
                "submitted_input_sha256": digest(snapshot),
                "native_input_sha256": digest(specification),
                "file_covalent_correspondence": correspondence,
                "geometry_constraints": "unreleased_variant_not_available",
                "layernorm": "torch",
                "triangle_kernels": "torch",
                "network_authorized": payload["allow_network"],
                "native_api": "mol.runner.batch_inference.inference_jsons",
                "options": options,
                "scope": "structure_prediction_not_measured_binding_or_affinity",
            }
        )
    )
    from mol.runner.batch_inference import inference_jsons

    inference_jsons(**options)
    collect_results(request, document[0]["name"], raw)
