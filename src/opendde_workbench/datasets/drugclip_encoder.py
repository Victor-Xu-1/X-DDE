"""Exact official encoder/projection heads, device-correct batches and required weight checks."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import torch

POLICY = "six_fold128_v1;heavy_atoms;bos_eos_zero_distance;seeded_etkdgv3;no_standardization"


def fingerprint():
    root = Path("/models")
    manifest = json.loads((root / "manifest.json").read_text())
    folds = [row for row in manifest["files"] if row["name"] in {f"fold_{i}.pt" for i in range(6)}]
    if len(folds) != 6:
        raise ValueError("The exact six-fold official weights are required.")
    body = {
        "folds": sorted(folds, key=lambda row: row["name"]),
        "recipe": manifest["recipe_sha256"],
        "encoding": POLICY,
    }
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(), body


def dictionaries():
    from unicore.data import Dictionary

    values = {}
    for role, filename in (("mol", "dict_mol.txt"), ("pocket", "dict_pkt.txt")):
        dictionary = Dictionary.load(str(Path("/opt/native/dict") / filename))
        dictionary.add_symbol("[MASK]", is_special=True)
        values[role] = dictionary
    return values


def model_for(fold, device, precision, vocab):
    from unimol.models.drugclip import BindingAffinityModel

    model = BindingAffinityModel(argparse.Namespace(), vocab["mol"], vocab["pocket"])
    # Only checksum-reviewed official resources are loaded; uploaded pickle/model files are refused.
    checkpoint = torch.load(
        Path("/models") / f"fold_{fold}.pt", map_location="cpu", weights_only=False
    )
    weights = checkpoint.get("model")
    if not isinstance(weights, dict):
        raise ValueError("Official checkpoint lacks its native model state.")
    required = {
        name
        for name in model.state_dict()
        if name.startswith(("mol_model.", "pocket_model.", "mol_project.", "pocket_project."))
    }
    if required - weights.keys():
        raise ValueError("An official encoder/projection weight is missing; encoding was refused.")
    incompatible = model.load_state_dict(weights, strict=False)
    if required.intersection(incompatible.missing_keys):
        raise ValueError("The exact native DrugCLIP encoder cannot be restored.")
    del checkpoint, weights
    model.to(device)
    if precision == "float16":
        model.half()
    return model.eval()


def batch_inputs(examples, dictionary, device):
    from scipy.spatial import distance_matrix

    lengths = [len(atoms) + 2 for atoms, _ in examples]
    maximum = ((max(lengths) + 7) // 8) * 8
    if maximum > 512 or not all(2 < length <= 512 for length in lengths):
        raise ValueError("Select a nonempty pocket or molecule within the native 512-token limit.")
    tokens = np.full((len(examples), maximum), dictionary.pad(), dtype=np.int64)
    distances = np.zeros((len(examples), maximum, maximum), dtype=np.float32)
    edges = np.zeros((len(examples), maximum, maximum), dtype=np.int64)
    for index, (atoms, coordinates) in enumerate(examples):
        coordinates = np.asarray(coordinates, dtype=np.float32)
        if coordinates.shape != (len(atoms), 3) or not np.isfinite(coordinates).all():
            raise ValueError("Encoder input coordinates are missing or nonfinite.")
        values = [dictionary.index(atom) for atom in atoms]
        if any(value == dictionary.unk() for value in values):
            raise ValueError("An element is outside the selected official DrugCLIP vocabulary.")
        values = np.array([dictionary.bos(), *values, dictionary.eos()], dtype=np.int64)
        tokens[index, : len(values)] = values
        coordinates = coordinates - coordinates.mean(axis=0)
        distances[index, 1 : len(values) - 1, 1 : len(values) - 1] = distance_matrix(
            coordinates, coordinates
        )
        edges[index, : len(values), : len(values)] = (
            values[:, None] * len(dictionary) + values[None, :]
        )
    return tuple(torch.from_numpy(value).to(device) for value in (tokens, distances, edges))


@torch.inference_mode()
def encode(model, examples, dictionary, role, device):
    tokens, distances, edges = batch_inputs(examples, dictionary, device)
    encoder = getattr(model, role + "_model")
    distances = distances.to(next(encoder.parameters()).dtype)
    nodes = distances.size(-1)
    bias = encoder.gbf_proj(encoder.gbf(distances, edges))
    bias = bias.permute(0, 3, 1, 2).contiguous().view(-1, nodes, nodes)
    representations = encoder.encoder(
        encoder.embed_tokens(tokens), padding_mask=tokens.eq(encoder.padding_idx), attn_mask=bias
    )[0][:, 0, :]
    embeddings = getattr(model, role + "_project")(representations).float()
    norms = embeddings.norm(dim=-1, keepdim=True)
    if not torch.isfinite(embeddings).all() or (norms <= 0).any():
        raise ValueError("Official encoder produced invalid embedding vectors.")
    return (embeddings / norms).cpu().numpy()
