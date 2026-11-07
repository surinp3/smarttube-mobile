#!/usr/bin/env python3
"""Point the TV in-app updater at a published signed recovery release."""

import argparse
import json
from pathlib import Path


def update_manifest(data, release_number, version_code):
    current = max(
        (value["versionCode"] for key, value in data.items() if key != "package"),
        default=0,
    )
    if version_code <= current:
        raise ValueError(f"Recovery versionCode must exceed TV updater version {current}")
    base = ("https://github.com/surinp3/smarttube-mobile/releases/download/"
            f"tv-v{release_number}/SmartTube-Pat-TV-v{release_number}")
    data["package"] = {
        "downloadUrlList_armeabi-v7a": [base + "-ARMv7.apk"],
        "downloadUrlList_arm64-v8a": [base + "-ARM64.apk"],
        "downloadUrl": base + "-Universal.apk",
    }
    data[f"32.69-tv.recovery.{release_number}"] = {
        "versionCode": version_code,
        "changelog": [
            "Recovery release: restores previously working playback code",
            "Can install over a newer broken version without deleting settings",
        ],
    }
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--release-number", type=int, required=True)
    parser.add_argument("--version-code", type=int, required=True)
    args = parser.parse_args()
    data = json.loads(args.manifest.read_text(encoding="utf-8"))
    update_manifest(data, args.release_number, args.version_code)
    args.manifest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
