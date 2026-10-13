"""Actual browser/3Dmol parsing, separate from DOM-only protocol tests; no inference."""

import os
from pathlib import Path

from playwright.sync_api import sync_playwright


def test_real_3dmol_preserves_native_dx_coordinates_scalars_and_units():
    sdk = Path(os.environ["WB_POTENTIAL_SDK"])
    source = """# APBS OpenDX format contract fixture, not a computed STAT6 result.
object 1 class gridpositions counts 2 2 2
origin -7.194400e+01 -7.862400e+01 -5.169300e+01
delta 9.755313e-01 0.000000e+00 0.000000e+00
delta 0.000000e+00 1.039854e+00 0.000000e+00
delta 0.000000e+00 0.000000e+00 9.976979e-01
object 2 class gridconnections counts 2 2 2
object 3 class array type double rank 0 items 8         data follows
-1.5 0.0 2.5
3.0 -4.5 5.0
6.0 7.5
attribute "dep" string "positions"
object "regular positions regular connections"         class field
component "positions" value 1
component "connections" value 2
component "data" value 3
"""
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page()
        page.set_content("<title>Potential parsing contract</title>")
        page.add_script_tag(path=str(sdk))
        for text in (source, source.replace("\n", "\r\n")):
            result = page.evaluate(
                """text => {
                const volume = XDDEPotential.potentialData(text);
                return {values: Array.from(volume.data), origin: volume.origin,
                    unit: volume.unit,
                    first: volume.getVal(volume.origin.x, volume.origin.y, volume.origin.z)};
            }""",
                text,
            )
            assert result["values"] == [-1.5, 0, 2.5, 3, -4.5, 5, 6, 7.5]
            assert {k: result["origin"][k] for k in ("x", "y", "z")} == {
                "x": -71.944,
                "y": -78.624,
                "z": -51.693,
            }
            assert {k: result["unit"][k] for k in ("x", "y", "z")} == {
                "x": 0.9755313,
                "y": 1.039854,
                "z": 0.9976979,
            }
            assert result["first"] == -1.5
        for ending in ("6.0", "6.0 7.5 9.0", "6.0 NaN"):
            assert page.evaluate(
                """text => {
                try { XDDEPotential.potentialData(text); return false; }
                catch { return true; }
            }""",
                source.replace("6.0 7.5", ending),
            )
        browser.close()
