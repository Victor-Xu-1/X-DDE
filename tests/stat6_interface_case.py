"""Keep the accepted deposited dimer and full native XML through cold restoration."""

import hashlib
import json
from collections import Counter
from dataclasses import replace

from opendde_workbench.examples.bundle import export_bundle, restore_bundle
from opendde_workbench.examples.pins import ExamplePins
from opendde_workbench.examples.stat6.catalogue import MODULES


def retained_interface(settings, store, tmp_path):
    pin = ExamplePins(store, settings.state_dir, modules=MODULES).get("structure", verify=True)
    assert str(pin.job_id) == "ba7e18cd-f7e6-4099-b80e-9601928eca4f" and pin.review
    output = settings.state_dir / "jobs" / str(pin.job_id) / "output"
    result = json.loads((output / "result.json").read_bytes())
    assert result["operation"] == "protein_interface" and result["version"] == "3.0.1"
    (interface,) = result["protein_interfaces"]
    assert interface["polymer_residues"] == 883
    assert Counter(row["kind"] for row in interface["interactions"]) == {
        "hydrophobic": 13,
        "hydrogen_bond": 32,
        "salt_bridge": 4,
        "pi_cation": 2,
        "water_bridge": 3,
    }
    assert (
        sum(
            row["residue"] == "PTR" or row["partner"]["residue"] == "PTR"
            for row in interface["interactions"]
        )
        == 18
    )
    xml = (output / "interface-01.xml").read_bytes()
    assert hashlib.sha256(xml).hexdigest() == (
        "4260fabca6e61f9f17527310aba5f2fe7a9f4f0f572d84fc96e6983f9593d278"
    )
    assert result["artifact_sha256"]["interface-01.xml"] == hashlib.sha256(xml).hexdigest()
    target = tmp_path / "reviewed-interface-only.zip"
    exported = export_bundle(
        settings,
        target,
        "88f81d4467ef28fd2f040a8321a62e0e272bd52c",
        capabilities=["structure"],
        profile="stat6",
    )
    replay = replace(settings, state_dir=tmp_path / "reviewed-interface-only")
    assert restore_bundle(target, replay, exported["sha256"])["computed"] == 1
    assert (
        replay.state_dir / "jobs" / str(pin.job_id) / "output/interface-01.xml"
    ).read_bytes() == xml
    return str(pin.job_id)
