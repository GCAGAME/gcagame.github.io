"""Build a self-contained HTML game using Python 3 and esbuild."""
import argparse
import base64
import json
import mimetypes
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def data_uri(path):
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if path.suffix == ".woff2":
        mime = "font/woff2"
    elif path.suffix == ".svg":
        mime = "image/svg+xml"
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--esbuild", help="Path to esbuild, if it is outside PATH.")
    parser.add_argument("--out", type=Path, default=ROOT.parent / "Play GCA.html")
    args = parser.parse_args()
    bundler = args.esbuild or shutil.which("esbuild")
    if not bundler:
        parser.error("Install esbuild or pass --esbuild with the path to its executable.")
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / "game.js"
        subprocess.run([str(Path(bundler).resolve()), "src/main.js", "--bundle", "--minify",
                        "--target=es2020", "--format=iife", "--alias:three=./vendor/three.module.js",
                        "--outfile=" + str(target)], cwd=ROOT, check=True)
        js = target.read_text(encoding="utf-8")
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = re.sub(
        r'((?:src|href)=")(\./assets/branding/[^"]+)(")',
        lambda match: match[1] + data_uri(ROOT / match[2]) + match[3],
        html,
    )
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    def inline_style_url(match):
        value = match.group(1).strip("'\" ")
        asset = ROOT / value
        return 'url("' + data_uri(asset) + '")' if asset.is_file() else match.group(0)
    css = re.sub(r"url\(([^)]+)\)", inline_style_url, css)
    html = html.replace('<link rel="stylesheet" href="./style.css">', "<style>" + css + "</style>")
    html = re.sub(r'<script type="importmap">.*?</script>', "", html, flags=re.S)
    assets = {p.relative_to(ROOT).as_posix(): data_uri(p) for p in sorted((ROOT / "assets").rglob("*")) if p.suffix.lower() in {".webp",".dds",".glb",".bin",".mesh"} and p.parent != ROOT / "assets"}
    script = "globalThis.BRIAR_ASSETS=" + json.dumps(assets, separators=(",", ":")) + ";\n" + js
    script = re.sub(r"</script", r"<\\/script", script, flags=re.I)
    html = html.replace('<script type="module" src="./src/main.js"></script>', "<script>" + script + "</script>")
    notices = []
    for path in [ROOT / "vendor/THREE-LICENSE.txt", *sorted((ROOT/"assets/fonts").glob("*license.txt")), *sorted((ROOT/"assets").rglob("*.md"))]:
        notices.append(path.read_text(encoding="utf-8").replace("--", "—"))
    html += "\n<!-- Third-party licenses\n" + "\n\n".join(notices) + "\n-->\n"
    args.out.write_text(html, encoding="utf-8")
    print(f"{args.out} ({args.out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

