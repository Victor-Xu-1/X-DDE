"""Reviewed public input questionnaire; never fabricated computed evidence."""

from ..integrations.contract import IntegratedTask
from ..proximity.options import TernaryPayload


def proximity_template(objects):
    roles = (("partner_a", "ternary_vhl"), ("partner_b", "ternary_brd4"), ("ligand", "ternary_mz1"))
    inputs = [{"role": role, "source": objects[key].reference} for role, key in roles]
    return IntegratedTask(
        operation="ternary_model",
        name="MZ1–BRD4–VHL · ternary core assemblies",
        inputs=inputs,
        scientific_inputs=[item["source"] for item in inputs],
        payload=TernaryPayload(
            input_mode="shared_complex",
            mechanism="protac",
            partner_a_chain="A",
            partner_b_chain="B",
            partner_a_name="VHL",
            partner_b_name="BRD4",
            samples=3,
            attempt_budget=3,
            wall_seconds=600,
            binding_region_a=list(range(32)),
            binding_region_b=list(range(42, 69)),
        ),
        options={"device": "cpu", "cpu": 2, "memory_mib": 6144, "seed": 31},
    ).model_dump(mode="json")
