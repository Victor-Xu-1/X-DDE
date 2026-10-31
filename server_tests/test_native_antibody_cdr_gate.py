"""Use the unchanged managed Harness gate on the deposited reference; no folding."""

import hashlib
import json
import os
import runpy
from pathlib import Path
from urllib.request import urlopen

import pytest

from opendde_workbench.antibodies.result import AntibodyNumberResult
from opendde_workbench.examples.stat6.antibody_cdr_inputs import interface_positions
from opendde_workbench.examples.stat6.catalogue import verified_input

pytestmark = pytest.mark.skipif(
    os.environ.get("WB_NATIVE_CDR_GATE") != "1", reason="Isolated native-parser CI only."
)
GATE_BLOB = "a1371b7a28253786f56442665e8429e1a5f12eb1"
GATE_URL = (
    "https://raw.githubusercontent.com/aurekaresearch/OpenDDE-Harness/v0.0.4/"
    "opendde_harness/plugin/protein_design/core/gate.py"
)


def test_deposited_interface_uses_native_zero_based_cdr_gate(tmp_path):
    with urlopen(GATE_URL, timeout=30) as response:
        code = response.read(128 * 1024)
    assert hashlib.sha1(b"blob " + str(len(code)).encode() + b"\0" + code).hexdigest() == GATE_BLOB
    gate_file = tmp_path / "gate.py"
    gate_file.write_bytes(code)
    gate = runpy.run_path(str(gate_file))["evaluate_hotspot_contact_map"]
    structure = tmp_path / "6WGL.pdb"
    structure.write_bytes(verified_input("dupilumab_complex"))
    report = AntibodyNumberResult.model_validate_json(
        Path("tests/fixtures/stat6/antibody_cdr/result.json").read_bytes()
    )
    sequences = {
        key: "".join(verified_input("dupilumab_" + key).decode().splitlines()[1:])
        for key in ("heavy", "light")
    }
    groups = interface_positions(report, sequences)
    missing, negative = gate(structure, ["A", "B"], [], target_chains=["C"])
    passed, positive = gate(
        structure,
        ["A", "B"],
        [],
        target_chains=["C"],
        all_cdr_positions={chain: set(sum(value.values(), [])) for chain, value in groups.items()},
        cdr3_positions={chain: set(value["CDR3"]) for chain, value in groups.items()},
    )
    assert not missing and negative["cdr_contact_fraction"] == 0
    assert positive["binder_interface_residues"] == negative["binder_interface_residues"] > 0
    assert passed and positive["cdr_contact_fraction_gate_passed"]
    assert (
        positive["cdr_contact_fraction_threshold"]
        == negative["cdr_contact_fraction_threshold"]
        == 0.5
    )
    assert positive["cdr_position_semantics"] == "zero_based_sequence_order"
    assert positive["epitope_gate_skipped"] and positive["cdr3_total_target_contacts"] > 0
    evidence = Path("outputs/antibody-cdr")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "native-gate.json").write_text(
        json.dumps(
            {
                "source_blob": GATE_BLOB,
                "input": "Deposited 6WGL, not a new prediction",
                "negative_missing_annotations": {
                    key: negative[key]
                    for key in positive
                    if key.endswith("fraction") or key.endswith("passed")
                },
                "annotated": {
                    key: positive[key]
                    for key in positive
                    if key.endswith("fraction") or key.endswith("passed")
                },
                "binding_or_predicted_geometry_accepted": False,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
