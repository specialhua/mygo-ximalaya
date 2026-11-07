"""Package only distributable plugin files; never include sessions or dependencies."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "plugin.json").read_text())
destination = root / "dist" / f"mygo-ximalaya-{manifest['version']}.zip"
destination.parent.mkdir(exist_ok=True)
with ZipFile(destination, "w", compression=ZIP_DEFLATED) as archive:
    for name in ("plugin.json", "index.js", "LICENSE", "THIRD_PARTY_NOTICES.md", "README.md", "licenses/noble-ciphers.txt"):
        archive.write(root / name, name)
print(destination)
