"""Explicit corrections to immutable historical interpretations, keyed by source evidence."""

_CORRECTIONS = (
    {
        "capability": "gnina.minimize",
        "revision": 3,
        "job": "22ccf2fe-cbcb-43aa-9852-af267c85b678",
        "result": "7bae030d010dbb5e2091413462bb55103f891a6ba19f285d8b73a95b216e4c51",
        "original": (
            "Independent PoseBusters 0.6.5 assessment passes the same "
            "22 applicable geometry checks."
        ),
        "corrected": (
            "The recorded review claimed 22 applicable PoseBusters passes, but its independent "
            "quality report is not linked to this fixed example; the claim cannot be verified "
            "from the retained evidence. Missing water or cofactor context is not a measured pass. "
            "原案例所述的 22 项适用质控未关联独立报告，无法在该固定案例中核验；"
            "缺失的水和辅因子环境不能计为已评估通过。"
        ),
    },
)


def correct_review(pin):
    if pin is None or pin.review is None:
        return pin, None
    for entry in _CORRECTIONS:
        if (
            pin.capability_id != entry["capability"]
            or pin.revision != entry["revision"]
            or str(pin.job_id) != entry["job"]
            or pin.artifact_sha256.get("result.json") != entry["result"]
        ):
            continue
        original = pin.review
        text = original.interpretation
        if text.count(entry["original"]) != 1:
            text = (
                "This historical interpretation could not be verified against its correction. "
                "See the original recorded review and the native result.\n\n"
                "历史解读无法与修订记录核对，请查看原始解读及原生结果。"
            )
        else:
            text = text.replace(entry["original"], entry["corrected"], 1)
        projected = original.model_copy(update={"interpretation": text})
        return pin.model_copy(update={"review": projected}), original
    return pin, None
