"""Capture the real click and download without retries or altered assertions."""

import json


def selected_pose_download(page, link, evidence):
    errors = []
    record_error = errors.append
    page.on("pageerror", record_error)
    page.context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page.evaluate("""() => {
      window.__xddeDownloadProbe = [];
      window.__xddeDownloadListener = event => {
        const node = event.target instanceof Element ? event.target : null;
        const anchor = node?.closest('a');
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        window.__xddeDownloadProbe.push({
          type: event.type, trusted: event.isTrusted,
          x: event.clientX, y: event.clientY,
          target: node?.outerHTML.slice(0, 1000),
          hit: hit?.outerHTML.slice(0, 1000),
          href: anchor?.getAttribute('href'),
          download: anchor?.getAttribute('download'),
          scroll: [window.scrollX, window.scrollY], time: performance.now()
        });
        if (window.__xddeDownloadProbe.length > 16) window.__xddeDownloadProbe.shift();
      };
      for (const type of ['pointerdown', 'pointerup', 'click']) {
        document.addEventListener(type, window.__xddeDownloadListener, true);
      }
    }""")
    before = link.evaluate("""node => ({
      href: node.getAttribute('href'), download: node.getAttribute('download'),
      rect: node.getBoundingClientRect().toJSON()
    })""")
    try:
        with page.expect_download() as event:
            link.click()
        return event.value
    finally:
        events = page.evaluate("""() => {
          for (const type of ['pointerdown', 'pointerup', 'click']) {
            document.removeEventListener(type, window.__xddeDownloadListener, true);
          }
          const events = window.__xddeDownloadProbe;
          delete window.__xddeDownloadListener;
          delete window.__xddeDownloadProbe;
          return events;
        }""")
        (evidence / "download-click.json").write_text(
            json.dumps(
                {
                    "before": before,
                    "events": events,
                    "page_errors": [str(error) for error in errors],
                },
                indent=2,
            )
        )
        page.context.tracing.stop(path=str(evidence / "download-trace.zip"))
        page.remove_listener("pageerror", record_error)
