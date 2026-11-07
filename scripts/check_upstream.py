#!/usr/bin/env python3
"""Compare the pinned SmartTube playback code against the original repositories.

Report mode is called before every mobile/TV build. Issue mode also creates or
updates one GitHub issue when upstream YouTube/playback sources change. This
never executes upstream commits, changes pins, or publishes unreviewed APKs.
"""

import argparse
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ISSUE_TITLE = "Upstream SmartTube playback changes need review"
ISSUE_MARKER = "<!-- smarttube-upstream-playback-watch -->"
API_ROOT = "https://api.github.com"


def api_request(path, token, method="GET", payload=None):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        API_ROOT + path,
        method=method,
        data=body,
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "smarttube-pinned-playback-watch",
            **({"Authorization": "Bearer " + token} if token else {}),
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except HTTPError as exc:
        raise RuntimeError(f"GitHub API {method} {path}: HTTP {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"GitHub API {method} {path}: {exc.reason}") from exc


def is_watched(filename, prefixes):
    return any(filename == prefix or filename.startswith(prefix) for prefix in prefixes)


def inspect_source(name, config, token, requester=api_request):
    repo = config["repo"]
    branch = config["branch"]
    pinned = config["pinned"]
    branch_data = requester(f"/repos/{repo}/branches/{quote(branch, safe='')}", token)
    head = branch_data["commit"]["sha"]
    result = {
        "name": name,
        "repo": repo,
        "branch": branch,
        "pinned": pinned,
        "head": head,
        "url": f"https://github.com/{repo}/compare/{pinned}...{head}",
        "commits": 0,
        "changed_files": 0,
        "watched_files": [],
        "uncertain": False,
        "status": "identical",
    }
    if head == pinned:
        return result

    compare = requester(f"/repos/{repo}/compare/{pinned}...{head}", token)
    files = [file["filename"] for file in compare.get("files", [])]
    result["commits"] = compare.get("total_commits", 0)
    result["status"] = compare.get("status", "unknown")
    result["changed_files"] = len(files)
    result["watched_files"] = sorted(
        file for file in files if is_watched(file, config["watch"])
    )
    # GitHub compare limits the returned file list to 300 entries. Treat an
    # incomplete or divergent comparison as requiring a human review.
    result["uncertain"] = (
        len(files) >= 300
        or result["status"] not in ("ahead", "identical")
        or result["commits"] > 250
    )
    return result


def needs_review(results):
    return any(source["watched_files"] or source["uncertain"] for source in results)


def render_report(results):
    lines = [
        "## SmartTube upstream playback compatibility check",
        "",
        "Both apps build reproducibly from pinned versions. This check detects",
        "upstream changes; it does **not** establish playback compatibility.",
        "",
        "| Repository | New commits | Watched files changed | Compared revisions |",
        "| --- | ---: | ---: | --- |",
    ]
    for result in results:
        lines.append(
            f"| {result['repo']} | {result['commits']} | "
            f"{len(result['watched_files'])}{'+' if result['uncertain'] else ''} | "
            f"[View upstream comparison]({result['url']}) |"
        )
    lines.append("")
    for result in results:
        if not result["watched_files"] and not result["uncertain"]:
            continue
        lines.extend([f"### {result['repo']}", ""])
        if result["uncertain"]:
            lines.append(
                "⚠️ The commit comparison is divergent or potentially truncated; "
                "inspect the complete upstream history."
            )
        for filename in result["watched_files"][:60]:
            lines.append(f"- `{filename.replace('`', '')}`")
        if len(result["watched_files"]) > 60:
            lines.append(
                f"- …and {len(result['watched_files']) - 60} other watched files"
            )
        lines.append("")
    lines.append(
        "**Next step:** review upstream diffs, refresh both pins and any custom "
        "patches together, pass CI, and test sign-in/playback on devices before "
        "publishing a new signed TV/mobile release."
    )
    return "\n".join(lines) + "\n"


def find_existing_issue(repository, token, requester=api_request):
    for page in range(1, 21):
        issues = requester(
            f"/repos/{repository}/issues?state=open&per_page=100&page={page}", token
        )
        for issue in issues:
            if issue.get("title") == ISSUE_TITLE and ISSUE_MARKER in issue.get("body", ""):
                return issue
        if len(issues) < 100:
            break
    return None


def sync_issue(results, repository, token, requester=api_request):
    if not repository or not token:
        raise RuntimeError("Issue mode requires GITHUB_REPOSITORY and GITHUB_TOKEN")
    existing = find_existing_issue(repository, token, requester)
    if needs_review(results):
        body = ISSUE_MARKER + "\n\n" + render_report(results)
        if existing is None:
            issue = requester(
                f"/repos/{repository}/issues", token, "POST",
                {"title": ISSUE_TITLE, "body": body},
            )
            print(f"Created upstream review issue: {issue['html_url']}")
        elif existing["body"] != body:
            requester(
                f"/repos/{repository}/issues/{existing['number']}",
                token, "PATCH", {"body": body},
            )
            print(f"Updated upstream review issue #{existing['number']}")
        else:
            print(f"Upstream review issue #{existing['number']} is current")
    elif existing:
        requester(
            f"/repos/{repository}/issues/{existing['number']}",
            token, "PATCH", {"state": "closed", "state_reason": "completed"},
        )
        print(f"Closed resolved upstream review issue #{existing['number']}")
    else:
        print("No watched upstream changes; no issue required")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("report", "issue"), default="report")
    parser.add_argument(
        "--pins", type=Path,
        default=Path(__file__).resolve().parent.parent / "upstream-pins.json",
    )
    args = parser.parse_args()
    pins = json.loads(args.pins.read_text(encoding="utf-8"))
    token = os.environ.get("GITHUB_TOKEN", "")
    results = [inspect_source(name, config, token) for name, config in pins.items()]
    report = render_report(results)
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as output:
            output.write(report)
    if needs_review(results):
        print("::warning title=YouTube playback code has changed upstream::"
              "Review the SmartTube/MediaServiceCore changes before publishing "
              "the next player update.")
    if args.mode == "issue":
        sync_issue(results, os.environ.get("GITHUB_REPOSITORY", ""), token)


if __name__ == "__main__":
    try:
        main()
    except (OSError, KeyError, ValueError, RuntimeError) as error:
        print(f"Upstream compatibility check failed: {error}", file=sys.stderr)
        sys.exit(1)
