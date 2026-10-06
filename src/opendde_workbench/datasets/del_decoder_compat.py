"""DELi 0.2.1's search_all failure return is adapted to its caller's tuple contract."""

import importlib.metadata


def normalize_failure(function):
    from deli.decode.barcode_calling import FailedBarcodeLookup, ValidCall

    def matching(codon, caller, length):
        result = function(codon, caller, length)
        if isinstance(result, FailedBarcodeLookup):
            # Preserve the exact failed/ambiguous native call. No alternative match is attempted.
            return result, -1, -1
        if (
            not isinstance(result, tuple)
            or len(result) != 3
            or not isinstance(result[0], (ValidCall, FailedBarcodeLookup))
        ):
            raise ValueError("Native DEL barcode caller returned an unsupported result contract.")
        return result

    return matching


def reviewed_decoder(decoder):
    from deli.decode.decoder import MATCHING_APPROACHES

    if importlib.metadata.version("deli-chem") != "0.2.1":
        raise ValueError(
            "Review the new native DELi decoder interface before upgrading this adapter."
        )
    original = MATCHING_APPROACHES["search_all"]
    for native in decoder.decoder.library_decoders.values():
        if native._matching_approach_func is not original:
            raise ValueError(
                "The selected native DEL matching method differs from the reviewed method."
            )
        native._matching_approach_func = normalize_failure(original)
    return decoder
