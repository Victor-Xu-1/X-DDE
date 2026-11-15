"""Exact canonical adapter in the existing isolated native Ketcher service."""

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from playwright.sync_api import expect


def prepare_policy(page, base, temporary):
    assert temporary.resolve().is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    installed = page.request.get(base + "/api/deployment").json()["installed"]["ketcher"]
    web = Path(installed["web"]).resolve()
    assert web.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
    code = """
      import {build} from 'vite'; import path from 'node:path';
      await build({configFile:false,build:{outDir:process.argv[1],
        lib:{entry:path.resolve('src/editors/recognition-host-editor.ts'),
          formats:['es'],fileName:()=> 'recognition-native-policy.js'}}});
    """
    subprocess.run(
        ["node", "--input-type=module", "-e", code, str(temporary)], cwd="frontend", check=True
    )
    target = web / "recognition-native-policy.js"
    assert not target.exists()
    shutil.copyfile(temporary / target.name, target)
    page.goto(base + "/tools/ketcher/index.html")
    page.wait_for_function("() => Boolean(window.ketcher)", timeout=45000)
    page.evaluate("""async () => {
      const {configureRecognitionEditor,createMolecularViewport} = await import('/tools/ketcher/recognition-native-policy.js');
      const native=window.ketcher;
      const viewport=createMolecularViewport(native.editor);
      window.nativePolicyState={busy:true,available:false};
      window.nativePolicyErrors=[]; window.nativePolicyStates=[];
      window.nativePolicyAbort=new AbortController();
      window.nativeDisplayPolicy=configureRecognitionEditor(native,window.nativePolicyAbort.signal,
        error=>window.nativePolicyErrors.push(String(error)), {
          fit:viewport.fit, resetZoom:viewport.resetZoom,
          onState:state=>{window.nativePolicyState=state;window.nativePolicyStates.push(state);}
        });
      window.nativeResizeWidths=[];
      const resize=new ResizeObserver(entries=>{
        const size=entries[0]?.contentRect;
        if (size) {
          window.nativeResizeWidths.push(Math.round(size.width));
          window.nativeDisplayPolicy.resize(size.width,size.height);
        }
      });
      resize.observe(document.documentElement);
      window.nativePolicyAbort.signal.addEventListener('abort',()=>resize.disconnect(),{once:true});
      await window.nativeDisplayPolicy.load('');
    }""")
    return target


def snapshot(page):
    return page.evaluate("""async () => ({
      ket:JSON.parse(await window.ketcher.getKet()),mol:await window.ketcher.getMolfile('v3000'),
      smiles:await window.ketcher.getSmiles(),key:await window.ketcher.getInChIKey(),
      zoom:window.ketcher.editor.zoom(),state:window.nativePolicyState,
      errors:window.nativePolicyErrors
    })""")


def wait_view(page):
    """Check visible native zoom and SVG containment, not only a hidden value."""
    wait_available(page)
    value = snapshot(page)
    expect(page.get_by_role("button", name=re.compile(r"^\d+%$"))).to_have_text(
        f"{round(value['zoom'] * 100)}%", timeout=5000
    )
    view = page.evaluate("""() => {
      const area=window.ketcher.editor.render.clientArea;
      const svg=area.matches('svg')?area:area.querySelector('svg');
      const box=svg.getBoundingClientRect(), viewport=svg.viewBox.baseVal;
      const bounds=element=>{const r=element.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
      return {box:bounds(svg),effectiveZoom:box.width/viewport.width,
        labels:[...svg.querySelectorAll('text')]
          .filter(text=>{
            const style=getComputedStyle(text), r=text.getBoundingClientRect();
            return text.textContent.trim() && style.visibility!=='hidden' &&
              style.display!=='none' && Number(style.opacity)!==0 && r.width>0 && r.height>0;
          })
          .map(bounds)};
    }""")
    assert abs(view["effectiveZoom"] - value["zoom"]) < 0.01
    assert view["labels"]
    for label in view["labels"]:
        assert label["left"] >= view["box"]["left"] - 2, view
        assert label["right"] <= view["box"]["right"] + 2, view
        assert label["top"] >= view["box"]["top"] - 2, view
        assert label["bottom"] <= view["box"]["bottom"] + 2, view
    return {**value, "view": view}


def wait_available(page, require_molecule=True):
    page.wait_for_function(
        "required => !window.nativePolicyState.busy && (!required || window.nativePolicyState.available)",
        arg=require_molecule,
        timeout=45000,
    )


def save_snapshot(directory, name, value):
    (directory / (name + ".mol")).write_text(value["mol"])
    (directory / (name + ".json")).write_text(json.dumps(value, indent=2))
