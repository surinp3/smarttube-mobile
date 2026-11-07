#!/usr/bin/env python3
"""Rebuild known-good app code as a higher-version signed Android update.

Android will not normally install an older versionCode over a newer one. A
recovery APK therefore uses the previous working source + the original package
ID and signing key, but has a new versionCode and user-facing release number.
"""

import argparse
from pathlib import Path
import re


def patch_version_code(patch_text):
    values = re.findall(r"^\+\s*versionCode\s+(\d+)\s*$", patch_text, re.MULTILINE)
    if len(values) != 1:
        raise ValueError("Expected one patched versionCode in the current app patch")
    return int(values[0])


def update_gradle(text, app, code, release_number):
    flavor = "stpattv" if app == "tv" else "stmobile"
    pattern = re.compile(r"(?ms)^(        " + flavor + r" \{\n)(.*?)(^        \})")
    match = pattern.search(text)
    if not match:
        raise ValueError(f"Could not locate Android product flavor {flavor}")
    body = match.group(2)
    previous = re.findall(r"(?m)^\s*versionCode\s+(\d+)\s*$", body)
    if len(previous) != 1 or code <= int(previous[0]):
        raise ValueError("Recovery versionCode must exceed the known-good versionCode")
    body, count_code = re.subn(
        r"(?m)^(\s*versionCode\s+)\d+(\s*)$",
        lambda m: m.group(1) + str(code) + m.group(2), body, count=1,
    )
    suffix = f"-tv.recovery.{release_number}" if app == "tv" else f"-mobile.recovery.{release_number}"
    body, count_suffix = re.subn(
        r'(?m)^(\s*versionNameSuffix\s+)"[^"]+"(\s*)$',
        lambda m: m.group(1) + '"' + suffix + '"' + m.group(2), body, count=1,
    )
    if count_code != 1 or count_suffix != 1:
        raise ValueError(f"Could not update {flavor} version fields")
    return text[:match.start(2)] + body + text[match.end(2):]


def update_mobile_java(text, release_number):
    result, count = re.subn(
        r"(private static final int MOBILE_VERSION\s*=\s*)\d+(;)",
        lambda m: m.group(1) + str(release_number) + m.group(2), text,
    )
    if count != 1:
        raise ValueError("Could not set the in-app Mobile update release number")
    return result


def validate_release_numbers(app, known_good_tag, release_number, release_tags):
    tag_pattern = r"tv-v(\d+)" if app == "tv" else r"v(\d+)"
    good = re.fullmatch(tag_pattern, known_good_tag)
    if not good or known_good_tag not in release_tags:
        raise ValueError("Known-good tag must be an existing original app release")
    existing = [int(m.group(1)) for tag in release_tags if (m := re.fullmatch(tag_pattern, tag))]
    if release_number <= max(existing, default=0):
        raise ValueError("Recovery release number must exceed every published app release number")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", choices=("tv", "mobile"), required=True)
    parser.add_argument("--known-good-tag", required=True)
    parser.add_argument("--release-number", type=int, required=True)
    parser.add_argument("--version-code", type=int, required=True)
    parser.add_argument("--release-tags", type=Path, required=True)
    parser.add_argument("--current-patch", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, required=True)
    args = parser.parse_args()

    if not (1 <= args.release_number <= 999_999):
        raise ValueError("Release number must be a positive integer")
    if not (1 <= args.version_code <= 2_100_000_000):
        raise ValueError("Invalid Android versionCode")
    release_tags = args.release_tags.read_text(encoding="utf-8").splitlines()
    validate_release_numbers(args.app, args.known_good_tag, args.release_number, release_tags)
    main_code = patch_version_code(args.current_patch.read_text(encoding="utf-8"))
    if args.version_code <= main_code:
        raise ValueError(
            f"Recovery versionCode must be greater than the current main source ({main_code})"
        )

    gradle_path = args.source_dir / "smarttubetv" / "build.gradle"
    gradle = update_gradle(
        gradle_path.read_text(encoding="utf-8"),
        args.app, args.version_code, args.release_number,
    )
    gradle_path.write_text(gradle, encoding="utf-8")

    if args.app == "mobile":
        java_path = (args.source_dir / "smarttubetv" / "src" / "main" / "java" /
                     "com" / "liskovsoft" / "smartyoutubetv2" / "mobile" / "ui" /
                     "MobileBrowseActivity.java")
        java_path.write_text(
            update_mobile_java(java_path.read_text(encoding="utf-8"), args.release_number),
            encoding="utf-8",
        )
    print(f"Prepared {args.app} recovery from {args.known_good_tag}: "
          f"release {args.release_number}, Android versionCode {args.version_code}")


if __name__ == "__main__":
    main()
