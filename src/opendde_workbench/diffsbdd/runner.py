"""Fixed native entry point. No independent DiffSBDD server, JobManager or DesignStore."""

import hashlib
import json
import os
import signal
import sys
from pathlib import Path

from chemistry import (
    edit,
    generation_input,
    inspect_identity,
    inspect_pocket,
    interactions,
    molecular_collection,
    prepare,
)


def verify_source():
    source = Path(os.environ["XDDE_DIFFSBDD_SOURCE"]).resolve()
    manifest = source / "xdde-native-manifest.json"
    if (
        hashlib.sha256(manifest.read_bytes()).hexdigest()
        != os.environ["XDDE_DIFFSBDD_MANIFEST_SHA256"]
    ):
        raise ValueError("Native source manifest changed.")
    data = json.loads(manifest.read_text())
    for name, checksum in data["files"].items():
        path = source / name
        if path.is_symlink() or not path.resolve().is_relative_to(source):
            raise ValueError("Native source escapes its installation.")
        if hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
            raise ValueError("Native scientific source failed integrity verification.")
    sys.path.insert(0, str(source))
    os.environ["DIFFSBDD_HOME"] = os.environ["XDDE_DIFFSBDD_HOME"]
    os.environ["DIFFSBDD_DATA_DIR"] = str(Path(sys.argv[1]) / "native-data")
    return data


def generate(payload, bindings, directory, output):
    from local_diffsbdd.generation import Request, run
    from local_diffsbdd.pockets import prepare_input

    native = generation_input(payload, bindings, directory)
    with prepare_input(native, None) as prepared:
        destination, report = run(
            Request(
                protein=prepared.protein,
                output=output / "native",
                count=native.options.count,
                atoms=native.options.atoms,
                seed=native.options.seed,
                reference=prepared.reference,
                # The native preview resolves residues even for a ligand-defined
                # pocket. Execution requires exactly one of those definitions.
                residues=() if prepared.reference else tuple(prepared.residues),
                initial_ligand=prepared.initial,
                objective=native.options.objective,
                settings=native.options,
            )
        )
    relative = destination.relative_to(output).as_posix()
    # Native reports remain intact; qualification is an independent platform result.
    result = {
        "status": report["status"],
        "valid": report["valid"],
        "attempted": report["attempted"],
        "report": report,
        "report_artifact": relative + "/report.json",
        "molecule_artifact": relative + "/molecules.sdf",
        "protein_artifact": relative + "/protein.pdb",
        "pocket_artifact": relative + "/pocket.pdb",
        "notes": report["notes"],
    }
    if payload["mode"] == "inpaint":
        from chemistry import molecule
        from verification import verify_inpaint

        evidence = verify_inpaint(
            molecule(payload["initial"], bindings, directory),
            payload["initial"],
            payload["options"]["fixed_atoms"],
            payload["options"]["preserve_bonds"],
            destination / "molecules.sdf",
            output,
            report["valid"],
        )
        result.update(
            core_verification=evidence,
            native_valid=report["valid"],
            valid=evidence["qualified_count"],
            molecule_artifact=evidence["qualified_artifact"],
        )
    return result


def main():
    directory = Path(sys.argv[1]).resolve()
    metadata = verify_source()
    request = json.loads((directory / "request.json").read_text())
    bindings = json.loads((directory / "bindings.json").read_text())
    if request["operation"] != "diffsbdd":
        raise ValueError("This runner only accepts DiffSBDD tasks.")
    output = directory / "output"
    output.mkdir(exist_ok=True)
    payload = request["payload"]
    mode = payload["mode"]
    if mode in {"generate", "inpaint", "diversify", "optimize"}:
        result = generate(payload, bindings, directory, output)
    else:
        handler = {
            "pocket": inspect_pocket,
            "identity": inspect_identity,
            "prepare": prepare,
            "edit": edit,
            "interactions": interactions,
            "properties": molecular_collection,
            "export": molecular_collection,
        }[mode]
        result = handler(payload, bindings, directory, output)
    result.update(
        operation="diffsbdd",
        mode=mode,
        complete=True,
        provenance={
            "source_commit": metadata["source_commit"],
            "engine": "DiffSBDD",
            "inputs": request["payload"],
        },
    )
    text = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)
    temporary = output / "result.json.tmp"
    temporary.write_text(text)
    temporary.replace(output / "result.json")
    print("X-DDE scientific operation completed", flush=True)


def terminate(signum, frame):
    raise KeyboardInterrupt("Scientific operation cancelled")


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, terminate)
    main()
