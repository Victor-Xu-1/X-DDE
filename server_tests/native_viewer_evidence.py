"""Check browser-captured 3D pixels, not merely a mounted canvas."""

import base64

from playwright.sync_api import expect


def capture_structure(page, destination):
    frame = page.frame_locator('iframe[title="Interactive molecular structure"]')
    canvas = frame.locator("canvas").first
    expect(canvas).to_be_visible(timeout=60000)
    canvas.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    screenshot = canvas.screenshot(path=str(destination))
    pixels = page.evaluate(
        """async image => {
      const picture = new Image(); picture.src = 'data:image/png;base64,' + image;
      await picture.decode();
      const target = document.createElement('canvas');
      target.width=picture.width; target.height=picture.height;
      const context=target.getContext('2d'); context.drawImage(picture,0,0);
      const data=context.getImageData(0,0,target.width,target.height).data;
      let visible=0;
      for(let i=0;i<data.length;i+=4) {
        if(data[i+3]>32 && Math.min(data[i],data[i+1],data[i+2])<230) visible++;
      }
      return {visible,area:target.width*target.height};
    }""",
        base64.b64encode(screenshot).decode(),
    )
    assert pixels["visible"] >= max(500, pixels["area"] * 0.001), pixels
    return pixels
