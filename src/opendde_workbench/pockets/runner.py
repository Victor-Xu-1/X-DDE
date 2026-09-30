"""One-shot native report normalization. It owns no server, queue or state database."""

import json
import sys
from pathlib import Path

from opendde_workbench.pockets.manifest import VERSION
from opendde_workbench.pockets.output import parse


def main():
    directory = Path(sys.argv[1]).resolve()
    request = json.loads((directory / "request.json").read_text())
    root = directory / "output/native"
    predictions = list(root.glob("*_predictions.csv"))
    residues = list(root.glob("*_residues.csv"))
    if len(predictions) != 1 or len(residues) != 1:
        raise ValueError("The native program did not return one prediction and residue report.")
    result = parse(predictions[0], residues[0], request["protein"], request["review_limit"])
    import shutil

    bindings = json.loads((directory / "bindings.json").read_text())
    original = directory / bindings[str(request["protein"]["asset_id"])].removeprefix("/job/")
    context = "protein" + original.suffix
    shutil.copyfile(original, directory / "output" / context)
    result["protein_artifact"] = context
    result.update(
        operation="pocket_search",
        complete=True,
        protein=request["protein"],
        profile=request["profile"],
        method="P2Rank",
        software_version=VERSION,
        scientific_acceptance="pending_server_validation",
        notes=(
            "Predicted protein-site hypotheses. Site probabilities are model-specific; "
            "not ligand affinity or experimental activity."
        ),
    )
    temporary = directory / "output/result.json.tmp"
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    temporary.replace(directory / "output/result.json")


if __name__ == "__main__":
    main()
