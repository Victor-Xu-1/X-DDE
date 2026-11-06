"""Select native interface verification only for its actual scientific sources."""

import fnmatch


def native_changed(changed):
    return any(
        fnmatch.fnmatchcase(name, "src/opendde_workbench/integrations/*interface*")
        or name
        in {
            "src/opendde_workbench/integrations/plip_contacts.py",
            "server_tests/test_native_protein_interface.py",
        }
        for name in changed
    )
