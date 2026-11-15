"""Exact canonical adapter in the existing isolated native Ketcher service."""

import json
import os
import shutil
import subprocess
from pathlib import Path


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
      const {configureRecognitionEditor} = await import('/tools/ketcher/recognition-native-policy.js');
      const native=window.ketcher;
      if (typeof native.editor.centerViewportAccordingToStruct !== 'function')
        throw new Error('The native drawing component needs viewport centering support.');
      window.nativePolicyState={busy:true,available:false};
      window.nativePolicyErrors=[]; window.nativePolicyStates=[];
      window.nativePolicyAbort=new AbortController();
      window.nativeDisplayPolicy=configureRecognitionEditor(native,window.nativePolicyAbort.signal,
        error=>window.nativePolicyErrors.push(String(error)), {
          fit:()=>{native.editor.centerViewportAccordingToStruct(native.editor.struct());return true;},
          resetZoom:()=>{native.editor.zoom(1);},
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


def wait_available(page, require_molecule=True):
    page.wait_for_function(
        "required => !window.nativePolicyState.busy && (!required || window.nativePolicyState.available)",
        arg=require_molecule,
        timeout=45000,
    )


def save_snapshot(directory, name, value):
    (directory / (name + ".mol")).write_text(value["mol"])
    (directory / (name + ".json")).write_text(json.dumps(value, indent=2))
