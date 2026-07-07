import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
APP_CONTENT = ASSETS / "config" / "app-content.json"
VERSION_JSON = ROOT / "version.json"
VERSION_SIG = ROOT / "version.sig"


def md5_file(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_app_content() -> dict:
    if not APP_CONTENT.exists():
        return {}
    try:
        return json.loads(APP_CONTENT.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Warning: failed to read {APP_CONTENT}: {exc}")
        return {}


def build_manifest() -> dict:
    if not ASSETS.exists():
        raise FileNotFoundError("assets folder not found")

    files = []
    for path in sorted(p for p in ASSETS.rglob("*") if p.is_file()):
        rel = path.relative_to(ROOT).as_posix()
        files.append(
            {
                "path": rel,
                "md5": md5_file(path),
                "size": path.stat().st_size,
            }
        )

    content = load_app_content()
    logic_hash = hashlib.md5()
    for item in files:
        if item["path"].startswith("assets/logic/") or item["path"] in (
            "assets/config/characters.json",
            "assets/config/cards.json",
        ):
            logic_hash.update(item["path"].encode("utf-8"))
            logic_hash.update(item["md5"].encode("utf-8"))

    logic_md5 = logic_hash.hexdigest() if any(item["path"].startswith("assets/logic/") for item in files) else ""
    return {
        "appVersion": str(content.get("appVersion", "1.3")),
        "announcementVersion": str(content.get("announcementVersion", content.get("appVersion", "1.3"))),
        "logicVersion": str(content.get("logicVersion", content.get("appVersion", "1.3"))),
        "protocolVersion": str(content.get("protocolVersion", content.get("appVersion", "1.3"))),
        "logicMd5": logic_md5,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "files": files,
    }


def sign_manifest() -> None:
    script = ROOT / "scripts" / "sign_manifest.cjs"
    if not script.exists():
        raise FileNotFoundError("scripts/sign_manifest.cjs not found")
    subprocess.run(["node", str(script), str(VERSION_JSON), str(VERSION_SIG)], cwd=ROOT, check=True)


def main() -> int:
    try:
        manifest = build_manifest()
        VERSION_JSON.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        sign_manifest()
        print(f"Generated {VERSION_JSON.name} and {VERSION_SIG.name}")
        print(f"Files: {len(manifest['files'])}")
        print(f"Logic version: {manifest['logicVersion']} / {manifest['logicMd5']}")
        return 0
    except Exception as exc:
        print(f"Failed to build manifest: {exc}")
        return 1
    finally:
        if sys.stdin.isatty():
            os.system("pause")


if __name__ == "__main__":
    raise SystemExit(main())
