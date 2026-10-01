"""Whole-file versus exact query semantics, budgets and unchanged snapshot bindings."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from opendde_workbench.chemistry.screen_contract import LibraryScreenTask
from opendde_workbench.chemistry.screen_options import ScreenOptions
from opendde_workbench.requests import TASK_ADAPTER, input_identifiers


def test_whole_library_is_not_misrepresented_as_one_query_version():
    library = {"asset_id": str(uuid4()), "sha256": "a" * 64}
    value = LibraryScreenTask(library=library)
    assert TASK_ADAPTER.validate_python(value.model_dump()).operation == "library_screen"
    assert input_identifiers(value) == {library["asset_id"]}
    query = {"asset_id": str(uuid4()), "sha256": "b" * 64, "record": 3, "conformer": 0}
    with pytest.raises(ValidationError, match="query molecule"):
        LibraryScreenTask(library=library, query=query)
    with pytest.raises(ValidationError, match="exact selected"):
        LibraryScreenTask(library=library, query=query, options={"mode": "similarity"})
    selected = LibraryScreenTask(
        library=library, query=query, scientific_inputs=[query], options={"mode": "similarity"}
    )
    assert input_identifiers(selected) == {library["asset_id"], query["asset_id"]}
    for patch in (
        {"maximum_mw": 50},
        {"minimum_similarity": 1.01},
        {"max_selected": 101},
        {"mode": "admet"},
    ):
        with pytest.raises(ValidationError):
            ScreenOptions(**patch)
