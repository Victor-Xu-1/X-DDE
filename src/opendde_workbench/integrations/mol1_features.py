"""Validate the published Mol-1 feature files without borrowing Boltz row limits."""

import json

from ..alignment_files import alignment_rows


def validate_features(component, bindings, assets):
    for identifier in (component.paired_msa, component.unpaired_msa):
        if not identifier:
            continue
        asset = bindings[str(identifier)]
        if asset.suffix != ".a3m":
            raise ValueError("Mol-1 alignments require native A3M files.")
        alphabet = set("ACDEFGHIKLMNPQRSTVWYX-" if component.kind == "protein" else "AUGCINX-")
        first = True
        for _, sequence in alignment_rows(
            assets.path(asset).read_text(encoding="utf-8-sig"), ".a3m"
        ):
            if not sequence or not set(sequence.upper()) <= alphabet:
                raise ValueError("The Mol-1 alignment contains unsupported sequence letters.")
            if first and sequence != component.value:
                raise ValueError("The alignment query must match its exact component sequence.")
            if len("".join(c for c in sequence if not c.islower())) != len(component.value):
                raise ValueError("Alignment rows must retain the component's sequence columns.")
            first = False
        if first:
            raise ValueError("The Mol-1 alignment contains no sequence records.")
    if not component.template_hits:
        return
    asset = bindings[str(component.template_hits)]
    if asset.suffix != ".json":
        return
    rows = json.loads(assets.path(asset).read_text(encoding="utf-8-sig"))
    if not isinstance(rows, list) or not 1 <= len(rows) <= 100:
        raise ValueError("Provide one to100native JSON structural templates.")
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"mmcif", "queryIndices", "templateIndices"}:
            raise ValueError(
                "JSON templates require embedded mmcif, queryIndices and templateIndices."
            )
        query, template = row["queryIndices"], row["templateIndices"]
        if not isinstance(row["mmcif"], str) or not row["mmcif"].lstrip().startswith("data_"):
            raise ValueError("Embed the actual template mmCIF; paths and URLs are not templates.")
        if (
            not isinstance(query, list)
            or not isinstance(template, list)
            or not query
            or len(query) != len(template)
            or any(type(i) is not int or not 0 <= i < len(component.value) for i in query)
            or any(type(i) is not int or not -1 <= i < 5000 for i in template)
            or len(set(query)) != len(query)
        ):
            raise ValueError(
                "Template mappings need distinct zero-based query indices "
                "and bounded template indices."
            )
