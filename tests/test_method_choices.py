"""Task intent alternatives refer only to implemented scientific contracts."""

from opendde_workbench.capabilities import frontend_catalogue
from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.capabilities.method_choices import method_choices


def test_professional_names_preserve_native_routes_sources_and_defaults():
    labels = {
        option["id"]: option["label"] for group in method_choices() for option in group["options"]
    }
    for identifier, name in {
        "openfe.rbfe": "OpenFE",
        "reinvent.design": "REINVENT4",
        "boltzgen.design": "BoltzGen",
        "openmm.refine": "OpenMM",
        "chemprop.predict": "Chemprop",
        "apbs.potential": "APBS",
        "plip.profile": "PLIP",
    }.items():
        assert labels[identifier] == name
    projection = {item["id"]: item for item in frontend_catalogue()}
    assert projection["openfe.rbfe"]["source"] == "OpenFE"
    assert CAPABILITIES["openfe.rbfe"].source == "openfe"
    assert CAPABILITIES["openfe.rbfe"].environment == "openfe"
    assert (
        next(group for group in method_choices() if group["id"] == "molecular_dynamics")["default"]
        == "openmm.dynamics"
    )


def test_alternatives_are_unique_registered_and_not_claimed_score_equivalence():
    groups = method_choices()
    seen = set()
    for group in groups:
        assert len(group["options"]) >= 1
        assert group["default"] in {option["id"] for option in group["options"]}
        for option in group["options"]:
            assert option["id"] not in seen
            seen.add(option["id"])
            assert CAPABILITIES[option["id"]].frontend_form
            assert len(option["note"]) == 2
    assert seen == {spec.id for spec in CAPABILITIES.values() if spec.frontend_form}
    assert not seen & {"rfdiffusion", "codesign", "rosetta"}
    groups[0]["options"][0]["id"] = "modified"
    assert method_choices()[0]["options"][0]["id"] == "predict"
