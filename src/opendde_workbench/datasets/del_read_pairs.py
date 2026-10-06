"""Matched paired FASTQ observations use one explicitly selected code-bearing mate."""

from itertools import zip_longest

from del_fastq import reads


def identity(name):
    key = name.split()[0]
    return key[:-2] if key.endswith(("/1", "/2")) else key


def observations(first, mate, options):
    if mate is None:
        yield from reads(first, options["expanded_bytes"], options.get("byte_budget"))
        return
    for left, right in zip_longest(
        reads(first, options["expanded_bytes"], options.get("byte_budget")),
        reads(mate, options["expanded_bytes"], options.get("byte_budget")),
    ):
        if left is None or right is None or identity(left.name) != identity(right.name):
            raise ValueError("Paired FASTQ identifiers/order or record counts do not match.")
        # Both input records are validated. Never double-count mates as separate molecules,
        # guess an overlap, or trim an unverified barcode/UMI region.
        yield right if options.get("encoded_mate", "r1") == "r2" else left
