"""Task intent alternatives refer only to implemented scientific contracts."""

from opendde_workbench.capabilities.definitions import CAPABILITIES
from opendde_workbench.capabilities.method_choices import method_choices


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
