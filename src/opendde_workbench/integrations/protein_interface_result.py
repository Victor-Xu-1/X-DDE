"""Reject truncated, mixed-source or incorrectly classified protein-interface reports."""

import math
from collections import Counter
from xml.etree import ElementTree

from ..artifacts import contained

XML_TYPES = {
    "hydrogen_bonds": "hydrogen_bond",
    "hydrophobic_interactions": "hydrophobic",
    "salt_bridges": "salt_bridge",
    "pi_stacks": "pi_stack",
    "pi_cation_interactions": "pi_cation",
    "halogen_bonds": "halogen_bond",
    "water_bridges": "water_bridge",
    "metal_complexes": "metal_complex",
}


def validate_interface_result(result, request, output):
    if request.operation != "protein_interface":
        if result.protein_interfaces is not None:
            raise ValueError("Protein-interface evidence belongs only to its exact operation.")
        return
    interfaces = result.protein_interfaces
    if (
        not interfaces
        or len(interfaces) != len(request.inputs)
        or result.interactions
        or result.candidates
    ):
        raise ValueError(
            "Keep complete protein-interface evidence separately for every input complex."
        )
    payload = request.payload
    all_files = set()
    for index, candidate in enumerate(interfaces):
        source = request.inputs[index].source
        if candidate.source != source or candidate.name != payload.candidate_names[index]:
            raise ValueError(
                "Protein-interface result differs from its exact named source complex."
            )
        names = [
            candidate.structure_artifact,
            candidate.xml_artifact,
            candidate.text_artifact,
            candidate.table_artifact,
        ]
        if (
            len(set(names)) != 4
            or all_files.intersection(names)
            or not set(names) <= result.artifact_sha256.keys()
        ):
            raise ValueError(
                "Every interface requires separate, byte-verified structure, "
                "XML, TXT and CSV files."
            )
        all_files.update(names)
        if result.artifact_sha256[candidate.structure_artifact] != source.sha256:
            raise ValueError(
                "Interface display structure must preserve the original scientific input bytes."
            )
        xml = contained(output, candidate.xml_artifact)
        if not 0 < xml.stat().st_size <= 32 * 1024**2:
            raise ValueError("Native interface report exceeds its size budget.")
        data = xml.read_bytes()
        if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
            raise ValueError("Native scientific XML must not contain document entities.")
        root = ElementTree.fromstring(data)
        if root.tag != "report" or root.findtext("plipversion") != result.version:
            raise ValueError("Native interface report has a different scientific program version.")
        native_counts = Counter()
        for parent in root.findall("./bindingsite/interactions"):
            for group in parent:
                if group.tag not in XML_TYPES:
                    raise ValueError(
                        "Native interface report contains an unsupported interaction class."
                    )
                native_counts[XML_TYPES[group.tag]] += len(group)
        typed_counts = Counter(row.kind for row in candidate.interactions)
        if +native_counts != typed_counts:
            raise ValueError(
                "Protein-interface contacts are truncated or differ from the full native report."
            )
        for row in candidate.interactions:
            if (
                row.chain not in payload.target_chains
                or (
                    row.partner_role == "partner" and row.partner.chain not in payload.binder_chains
                )
                or (row.partner_role == "cofactor" and row.kind != "metal_complex")
            ):
                raise ValueError(
                    "Protein-interface endpoint chain differs from the selected partners."
                )
            if not math.isclose(
                math.dist(row.protein_position, row.ligand_position), row.distance, abs_tol=1e-6
            ):
                raise ValueError(
                    "Protein-interface distance differs from its exact source endpoints."
                )
