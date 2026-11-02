"""Check browser-captured 3D pixels, not merely a mounted canvas."""

import base64

from playwright.sync_api import expect


def analyze_capture(page, screenshot):
    return page.evaluate(
        """async image => {
      const picture = new Image(); picture.src = 'data:image/png;base64,' + image;
      await picture.decode();
      const target = document.createElement('canvas');
      target.width=picture.width; target.height=picture.height;
      const context=target.getContext('2d'); context.drawImage(picture,0,0);
      const data=context.getImageData(0,0,target.width,target.height).data;
      const histogram=new Uint32Array(4096);
      const bin=i=>(data[i]>>4)*256+(data[i+1]>>4)*16+(data[i+2]>>4);
      for(let i=0;i<data.length;i+=4) if(data[i+3]>32) histogram[bin(i)]++;
      let background=0;
      for(let i=1;i<histogram.length;i++) if(histogram[i]>histogram[background]) background=i;
      let visible=0,minX=target.width,minY=target.height,maxX=-1,maxY=-1;
      for(let i=0;i<data.length;i+=4) {
        if(data[i+3]<=32 || bin(i)===background) continue;
        visible++; const pixel=i/4,x=pixel%target.width,y=Math.floor(pixel/target.width);
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      }
      return {visible,area:target.width*target.height,width:target.width,height:target.height,
        colors:[...histogram].filter(n=>n>=2).length,
        spanX:Math.max(0,maxX-minX+1),spanY:Math.max(0,maxY-minY+1)};
    }""",
        base64.b64encode(screenshot).decode(),
    )


def assert_structure_pixels(pixels):
    assert (
        pixels["visible"] >= max(500, pixels["area"] * 0.001)
        and pixels["colors"] >= 4
        and pixels["spanX"] >= pixels["width"] * 0.08
        and pixels["spanY"] >= pixels["height"] * 0.08
    ), pixels


def capture_structure(page, destination):
    frame = page.frame_locator('iframe[title="Interactive molecular structure"]')
    canvas = frame.locator("canvas").first
    expect(canvas).to_be_visible(timeout=60000)
    canvas.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    pixels = analyze_capture(page, canvas.screenshot(path=str(destination)))
    assert_structure_pixels(pixels)
    return pixels
