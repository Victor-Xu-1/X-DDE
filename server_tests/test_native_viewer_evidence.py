"""Verification regressions: uniform/transparent canvases cannot become 3D evidence."""

import base64

import pytest
from native_viewer_evidence import analyze_capture, assert_structure_pixels
from playwright.sync_api import sync_playwright


@pytest.fixture(scope="module")
def page():
    with sync_playwright() as driver:
        browser = driver.chromium.launch()
        page = browser.new_page()
        yield page
        browser.close()


def fixture_image(page, color, diverse=False):
    image = page.evaluate(
        """({color,diverse}) => {
      const canvas=document.createElement('canvas'); canvas.width=320;canvas.height=240;
      const ctx=canvas.getContext('2d');
      if(color) {ctx.fillStyle=color;ctx.fillRect(0,0,320,240);}
      if(diverse) for(let i=0;i<12;i++) {
        ctx.fillStyle=`hsl(${i*30} 70% 45%)`;ctx.fillRect(50+i*15,50+i*8,45,45);
      }
      return canvas.toDataURL().split(',')[1];
    }""",
        {"color": color, "diverse": diverse},
    )
    return base64.b64decode(image)


@pytest.mark.parametrize("color", ["black", "white", "red", "#111111", "#f0f0f0", None])
def test_uniform_and_transparent_canvases_are_rejected(page, color):
    pixels = analyze_capture(page, fixture_image(page, color))
    with pytest.raises(AssertionError):
        assert_structure_pixels(pixels)


def test_spatially_varied_graphics_fixture_passes_the_pixel_gate(page):
    # Graphics-only fixture; never presented as a molecular or scientific result.
    pixels = analyze_capture(page, fixture_image(page, "white", diverse=True))
    assert_structure_pixels(pixels)
