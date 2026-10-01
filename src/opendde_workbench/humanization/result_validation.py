"""Validate mathematical proposal rules and retained source numbering without importing models."""

from ..antibodies.native_numbering import region
from .proposals import propose, validate_scores


def numbering(value, sequence):
    if (
        len(value) != len(sequence)
        or [row.source_position for row in value] != list(range(1, len(sequence) + 1))
        or "".join(row.amino_acid for row in value) != sequence
        or len({(row.number, row.insertion) for row in value}) != len(value)
        or any(row.region != region(row.number) for row in value)
    ):
        raise ValueError(
            "Native numbering changed source positions, residue identities or CDR regions."
        )


def evaluation(value, sequence, scores):
    if value is None:
        raise ValueError("An evaluated sequence requires its actual native reference summary.")
    validate_scores(scores, sequence)
    expected_mean = sum(row[aa] for row, aa in zip(scores, sequence, strict=True)) / len(sequence)
    if abs(value.mean_native_residue_probability - expected_mean) > 1e-12:
        raise ValueError("The sequence score differs from its retained native probabilities.")
    peptides = [sequence[index : index + 9] for index in range(len(sequence) - 8)]
    if [row.source_position for row in value.peptides] != list(range(1, len(peptides) + 1)) or [
        row.sequence for row in value.peptides
    ] != peptides:
        raise ValueError("Reference matches omitted or changed an original peptide window.")


def row_evidence(row, options):
    if row.status == "failed":
        if (
            not row.reason
            or row.numbering
            or row.chain_type
            or row.numbering_score is not None
            or row.original_scores
            or row.original_evaluation
            or row.proposal
            or row.proposal_scores
            or row.proposal_evaluation
            or row.proposal_numbering
            or row.proposal_chain_type
            or row.proposal_numbering_score is not None
            or row.iterations
            or row.artifact
            or row.artifact_sha256
        ):
            raise ValueError(
                "An unsupported sequence must retain a reason without invented predictions."
            )
        return
    if (
        row.reason
        or row.chain_type is None
        or row.numbering_score is None
        or not row.original_scores
        or not 70 <= len(row.source_sequence) <= 200
        or (options.format == "vhh_exploratory" and row.chain_type != "H")
    ):
        raise ValueError("Native variable-region evaluation evidence is incomplete.")
    numbering(row.numbering, row.source_sequence)
    evaluation(row.original_evaluation, row.source_sequence, row.original_scores)
    original = row.source_sequence
    current, scores = original, row.original_scores
    if options.mode == "evaluate" and row.iterations:
        raise ValueError("Sequence evaluation cannot invent humanization iterations.")
    if options.mode == "framework" and not 1 <= len(row.iterations) <= options.iterations:
        raise ValueError("Humanization iterations exceed or omit their declared budget.")
    for index, iteration in enumerate(row.iterations):
        if iteration.iteration != index + 1 or iteration.input_sequence != current:
            raise ValueError("Humanization iteration identity or sequence history changed.")
        if index == 0 and iteration.native_scores != row.original_scores:
            raise ValueError("The first proposal changed its original native score matrix.")
        scores = iteration.native_scores
        expected, changes = propose(
            original,
            current,
            scores,
            [residue.model_dump() for residue in row.numbering],
            options.max_mutations,
        )
        if expected != iteration.proposal or changes != [
            value.model_dump() for value in iteration.changes
        ]:
            raise ValueError("The proposal differs from protected native-score selection.")
        if expected == current and index != len(row.iterations) - 1:
            raise ValueError("An unchanged proposal cannot claim further iterations.")
        current = expected
    if row.proposal != (current if current != original else None):
        raise ValueError("The final proposal changed original/unchanged sequence identity.")
    if row.proposal:
        if row.proposal_chain_type != row.chain_type or row.proposal_numbering_score is None:
            raise ValueError("The independently numbered candidate changed its chain identity.")
        if not row.proposal_scores or not row.artifact or not row.artifact_sha256:
            raise ValueError("Changed sequence evidence and its immutable FASTA are incomplete.")
        evaluation(row.proposal_evaluation, row.proposal, row.proposal_scores)
        numbering(row.proposal_numbering, row.proposal)
        old = {
            (residue.number, residue.insertion): residue
            for residue in row.numbering
            if residue.region != "framework"
        }
        new = {
            (residue.number, residue.insertion): residue
            for residue in row.proposal_numbering
            if residue.region != "framework"
        }
        if old != new:
            raise ValueError("The independently numbered candidate changed an original CDR.")
        if row.proposal.count("C") != original.count("C"):
            raise ValueError("A framework proposal changed original cysteine content.")
    elif (
        row.proposal_scores
        or row.proposal_evaluation
        or row.proposal_numbering
        or row.proposal_chain_type
        or row.proposal_numbering_score is not None
        or row.artifact
        or row.artifact_sha256
    ):
        raise ValueError("An unchanged source cannot claim a new candidate or invented evaluation.")
