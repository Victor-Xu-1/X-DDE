"""Raw reviewed public-source manifest shared without importing runtime stores."""

import json
from pathlib import Path

MANIFEST = json.loads(Path(__file__).with_name("catalogue.json").read_text(encoding="utf-8"))
