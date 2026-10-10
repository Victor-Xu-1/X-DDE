"""Observe actual native text textures and GPU sprite scale; never alter scientific output."""

import json


def observe_native_label_pixels(page):
    page.add_init_script(r"""(() => {
      const glyphs=new WeakMap(), textures=new WeakMap(), bindings=new WeakMap();
      const scales=new WeakMap(), locations=new WeakMap();
      window.__nativeLabelPixels=[];
      const fill=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(...args) {
        const result=fill.apply(this,args), text=String(args[0]);
        const font=/([\d.]+)px/.exec(this.font);
        if (/^[^:]+:[A-Z]{3}-?\d+.*Å$/.test(text) && font)
          glyphs.set(this.canvas,{text,font:Number(font[1]),height:this.canvas.height});
        return result;
      };
      for (const Type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]) {
        if (!Type) continue;
        const proto=Type.prototype;
        const bind=proto.bindTexture, upload=proto.texImage2D;
        const locate=proto.getUniformLocation, uniform=proto.uniform2f, draw=proto.drawElements;
        proto.bindTexture=function(...args) {
          if(args[0]===this.TEXTURE_2D) bindings.set(this,args[1]);
          return bind.apply(this,args);
        };
        proto.texImage2D=function(...args) {
          const result=upload.apply(this,args), image=args.at(-1), glyph=glyphs.get(image);
          const texture=bindings.get(this);
          if(glyph && texture) textures.set(texture,glyph);
          return result;
        };
        proto.getUniformLocation=function(...args) {
          const result=locate.apply(this,args);
          if(result && args[1]==='scale') locations.set(result,true);
          return result;
        };
        proto.uniform2f=function(...args) {
          if(locations.has(args[0])) scales.set(this,[args[1],args[2]]);
          return uniform.apply(this,args);
        };
        proto.drawElements=function(...args) {
          const result=draw.apply(this,args), glyph=textures.get(bindings.get(this));
          const scale=scales.get(this);
          if(glyph && scale) {
            const viewport=Array.from(this.getParameter(this.VIEWPORT));
            // Native sprite quad is -1..1; its normalized scale gives this pixel height.
            const renderedEm=glyph.font*Math.abs(scale[1])*viewport[3]/glyph.height;
            window.__nativeLabelPixels.push({...glyph,scale,viewport,renderedEm});
          }
          return result;
        };
      }
    })();""")


def inspect_native_label_pixels(panel, evidence, filename, dpi=600, width=2102, pt=7):
    rows = panel.locator("iframe").first.evaluate(
        "frame => frame.contentWindow.__nativeLabelPixels || []"
    )
    # Only actual capture-sized draws, not the original on-screen viewport.
    selected = [row for row in rows if row["viewport"][2] == width]
    assert selected, "No native contact text was drawn at the requested print resolution"
    for row in selected:
        row["printedPt"] = row["renderedEm"] * 72 / dpi
        assert abs(row["printedPt"] - pt) < 0.02, row
    (evidence / (filename + "-native-type.json")).write_text(
        json.dumps(selected, indent=2), encoding="utf-8"
    )
