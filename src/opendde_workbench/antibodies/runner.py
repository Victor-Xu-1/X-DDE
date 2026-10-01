"""Offline actual ANARCII model; no service, platform database or runtime downloads."""

import hashlib
import json
from importlib.metadata import version
from pathlib import Path

from fasta import read_fasta
from native_numbering import normalize_domain
from options import NumberingOptions


def run_number(request, bindings, directory, output):
    import torch
    from anarcii import Anarcii

    ref = request["sequences"]
    binding = bindings[str(ref["asset_id"])]
    if not binding.startswith("/job/assets/"):
        raise ValueError("Antibody input escapes the managed snapshot.")
    file = directory / binding.removeprefix("/job/")
    if (
        file.is_symlink()
        or not file.resolve().is_relative_to((directory / "assets").resolve())
        or file.suffix not in {".fa", ".fasta"}
    ):
        raise ValueError("Choose the actual FASTA sequence snapshot.")
    raw = file.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ref["sha256"]:
        raise ValueError("Input sequence version digest changed.")
    records = read_fasta(raw)
    options = NumberingOptions.model_validate(request["options"])
    # VHH must use antibody mode. Upstream's literal vhh alias selects shark/VNAR.
    model = Anarcii(
        seq_type="antibody",
        mode=options.mode,
        cpu=True,
        ncpu=options.cpu,
        batch_size=8,
        verbose=False,
        return_logits=False,
    )
    native = model.number(
        {record["id"]: record["sequence"] for record in records}, scfv=options.scfv
    )
    if not isinstance(native, dict) or not 1 <= len(native) <= 100:
        raise ValueError("Native numbering did not return a bounded domain collection.")
    rows = []
    covered = set()
    for key, value in native.items():
        if not isinstance(key, str) or not isinstance(value, dict):
            raise ValueError("Native domain report is malformed.")
        # scFv emits numeric suffixes; exact key takes precedence, ambiguous matches fail.
        exact = [record for record in records if key == record["id"]]
        matched = exact or [
            record
            for record in records
            if key.rsplit("-", 1)[0] == record["id"] and key.rsplit("-", 1)[-1].isdigit()
        ]
        if len(matched) != 1:
            raise ValueError("Native domain identifier cannot be uniquely mapped to its source.")
        record = matched[0]
        covered.add(record["id"])
        rows.append(normalize_domain(value, record, key, len(rows), output))
    if covered != {record["id"] for record in records}:
        raise ValueError("Native numbering omitted an original input sequence.")
    import anarcii

    models = Path(anarcii.__file__).parent / "models/antibody"
    weights = {
        f.name: hashlib.sha256(f.read_bytes()).hexdigest()
        for f in models.glob("*")
        if f.suffix in {".pt", ".json"}
    }
    if len(weights) != 4:
        raise ValueError("Bundled antibody model resources are incomplete.")
    return {
        "operation": "antibody_number",
        "complete": True,
        "schema_version": 1,
        "source": ref,
        "options": options.model_dump(mode="json"),
        "input_records": records,
        "domains": rows,
        "versions": {"anarcii": version("anarcii"), "torch": torch.__version__},
        "weights_sha256": weights,
        "scheme": "imgt",
        "source_positions": "one_based_inclusive",
        "native_interval": "zero_based_inclusive",
        "scope": "antibody_numbering_and_chain_domains_not_humanness_binding_or_developability",
    }


def main():
    directory, output = Path("/input"), Path("/output")
    request = json.loads((directory / "request.json").read_text())
    if request["operation"] != "antibody_number":
        raise ValueError("Unsupported antibody operation.")
    value = run_number(
        request, json.loads((directory / "bindings.json").read_text()), directory, output
    )
    file = output / "result.json.tmp"
    file.write_text(json.dumps(value, allow_nan=False), encoding="utf-8")
    file.replace(output / "result.json")


if __name__ == "__main__":
    main()
