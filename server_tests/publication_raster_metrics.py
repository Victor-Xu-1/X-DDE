"""Observe actual native text textures and GPU sprite scale; never alter scientific output."""

import json


def observe_native_label_pixels(page):
    page.add_init_script(r"""(() => {
      const glyphs=new WeakMap(), textures=new WeakMap(), bindings=new WeakMap();
      const scales=new WeakMap(), locations=new WeakMap(), frames=new WeakMap();
      const bitmaps=new WeakMap();
      const programs=new WeakSet();
      const stats={fills:0,uploads:0,locations:0,passes:0,scales:0,draws:0,glyphDraws:0};
      const events=[];
      const record=(kind,canvas,detail={}) => {
        events.push({kind,width:canvas.width,height:canvas.height,...detail});
        if(events.length>24) events.shift();
      };
      window.__nativeLabelCaptures=[];
      const encode=HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL=function(...args) {
        const rows=frames.get(this);
        window.__nativeLabelCaptures.push({
          width:this.width,height:this.height,rows:rows ? [...rows] : [],
          stats:{...stats},events:[...events]});
        return encode.apply(this,args);
      };
      // The pinned renderer uses a shared OffscreenCanvas, then transfers its
      // real pixels to the HTML canvas encoded by pngURI. Follow that native
      // copy so the assertion inspects the encoded image, not a stale GL frame.
      const Offscreen=window.OffscreenCanvas, Bitmap=window.ImageBitmapRenderingContext;
      if(Offscreen && Bitmap) {
        const capture=Offscreen.prototype.transferToImageBitmap;
        const present=Bitmap.prototype.transferFromImageBitmap;
        Offscreen.prototype.transferToImageBitmap=function(...args) {
          const rows=frames.get(this), bitmap=capture.apply(this,args);
          if(rows) bitmaps.set(bitmap,[...rows]);
          frames.delete(this);
          return bitmap;
        };
        Bitmap.prototype.transferFromImageBitmap=function(bitmap) {
          const rows=bitmap && bitmaps.get(bitmap);
          const result=present.call(this,bitmap);
          frames.set(this.canvas,rows || []);
          record('bitmap-present',this.canvas,{rows:rows?.length || 0});
          return result;
        };
      }
      const fill=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(...args) {
        const result=fill.apply(this,args), text=String(args[0]);
        const font=/([\d.]+)px/.exec(this.font);
        if (text.trim() && text.length<=128 && font) {
          stats.fills++;
          glyphs.set(this.canvas,{text,font:Number(font[1]),height:this.canvas.height});
        }
        return result;
      };
      for (const Type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]) {
        if (!Type) continue;
        const proto=Type.prototype;
        const bind=proto.bindTexture, upload=proto.texImage2D;
        const locate=proto.getUniformLocation, uniform=proto.uniform2fv, draw=proto.drawElements;
        const use=proto.useProgram, clear=proto.clear;
        proto.clear=function(...args) {
          // Embedded labels are rendered before framebuffer composition;
          // floating labels follow it. Reset only the native scene clear,
          // retaining both passes through the default-framebuffer composite.
          if((args[0] & this.COLOR_BUFFER_BIT) &&
            (this.getParameter(this.FRAMEBUFFER_BINDING)!==null ||
              typeof this.drawBuffers!=='function')) frames.set(this.canvas,[]);
          return clear.apply(this,args);
        };
        proto.useProgram=function(program) {
          // WebGL2 composites an off-screen buffer by clearing the final canvas.
          // Retain the latest sprite pass through that unchanged composite.
          if(programs.has(program)) {
            stats.passes++;
            record('sprite-pass',this.canvas,{previousRows:frames.get(this.canvas)?.length || 0});
            if(!frames.has(this.canvas)) frames.set(this.canvas,[]);
          }
          return use.call(this,program);
        };
        proto.bindTexture=function(...args) {
          if(args[0]===this.TEXTURE_2D) bindings.set(this,args[1]);
          return bind.apply(this,args);
        };
        proto.texImage2D=function(...args) {
          const result=upload.apply(this,args), image=args.at(-1), glyph=glyphs.get(image);
          const texture=bindings.get(this);
          if(glyph && texture) {
            stats.uploads++;
            textures.set(texture,glyph);
          }
          return result;
        };
        proto.getUniformLocation=function(...args) {
          const result=locate.apply(this,args);
          if(result && args[1]==='scale') {
            stats.locations++;
            locations.set(result,true); programs.add(args[0]);
          }
          return result;
        };
        proto.uniform2fv=function(...args) {
          if(locations.has(args[0])) {
            stats.scales++;
            scales.set(this,Array.from(args[1]));
          }
          return uniform.apply(this,args);
        };
        proto.drawElements=function(...args) {
          const result=draw.apply(this,args), glyph=textures.get(bindings.get(this));
          const scale=scales.get(this);
          stats.draws++;
          if(glyph && scale) {
            stats.glyphDraws++;
            const viewport=Array.from(this.getParameter(this.VIEWPORT));
            // Native sprite quad is -1..1; its normalized scale gives this pixel height.
            const renderedEm=glyph.font*Math.abs(scale[1])*viewport[3]/glyph.height;
            const program=this.getParameter(this.CURRENT_PROGRAM);
            const value=name=>this.getUniform(program,locate.call(this,program,name));
            let origin;
            if(value('useScreenCoordinates')) origin=value('screenPosition');
            else {
              const model=value('modelViewMatrix'),projection=value('projectionMatrix');
              const clip=[0,1,2,3].map(row=>[0,1,2,3].reduce(
                (sum,col)=>sum+projection[col*4+row]*model[12+col],0));
              origin=clip.map(component=>component/clip[3]);
            }
            const alignment=value('alignment'),rotation=value('rotation');
            const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>{
              x+=alignment[0]; y+=alignment[1];
              const dx=(Math.cos(rotation)*x-Math.sin(rotation)*y)*scale[0];
              const dy=(Math.sin(rotation)*x+Math.cos(rotation)*y)*scale[1];
              return {x:(origin[0]+dx+1)*viewport[2]/2,y:(1-origin[1]-dy)*viewport[3]/2};
            });
            const left=Math.min(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y));
            const box={x:left,y:top,width:Math.max(...corners.map(p=>p.x))-left,
              height:Math.max(...corners.map(p=>p.y))-top};
            const rows=frames.get(this.canvas);
            if(rows) rows.push({...glyph,scale,viewport,renderedEm,box,
              depthTest:this.isEnabled(this.DEPTH_TEST)});
            record('glyph-draw',this.canvas,{font:glyph.font,rows:rows?.length || 0});
          }
          return result;
        };
      }
    })();""")


def inspect_native_label_pixels(
    panel, evidence, filename, dpi=600, width=2102, pt=7, required_text=None
):
    captures = panel.locator("iframe").first.evaluate(
        "frame => frame.contentWindow.__nativeLabelCaptures || []"
    )
    # Inspect the exact frame that pngURI encoded, not resize/restoration draws.
    matching = [capture for capture in captures if capture["width"] == width]
    (evidence / (filename + "-native-capture.json")).write_text(
        json.dumps(captures[-4:], indent=2), encoding="utf-8"
    )
    assert matching, {"message": "Native PNG capture was not observed", "captures": captures[-2:]}
    selected = matching[-1]["rows"]
    assert selected, "The encoded PNG had no native annotation text"
    if required_text:
        assert any(required_text in row["text"] for row in selected), {
            "required": required_text,
            "text": [row["text"] for row in selected],
        }
    for row in selected:
        assert row["depthTest"] is False, {"occluded_annotation": row}
        row["printedPt"] = row["renderedEm"] * 72 / dpi
        assert abs(row["printedPt"] - pt) < 0.02, row
        # Export detail must come from full-resolution native glyphs, rather
        # than magnifying a smaller text texture to obtain the right em size.
        row["textureMagnification"] = row["renderedEm"] / row["font"]
        assert row["textureMagnification"] <= 1 + 1e-6, row
    for index, row in enumerate(selected):
        a = row["box"]
        for other in selected[index + 1 :]:
            b = other["box"]
            assert (
                a["x"] + a["width"] <= b["x"] + 1
                or b["x"] + b["width"] <= a["x"] + 1
                or a["y"] + a["height"] <= b["y"] + 1
                or b["y"] + b["height"] <= a["y"] + 1
            ), {"overlapping_labels": [row["text"], other["text"]], "boxes": [a, b]}
    (evidence / (filename + "-native-type.json")).write_text(
        json.dumps(selected, indent=2), encoding="utf-8"
    )
    return selected
