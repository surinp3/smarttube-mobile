# TV v14: related videos below the player

The player already supported Leanback suggestion rows. TV v13 could erase all
of them: strict title matching required two terms, high coverage and a match
in the title's final third. Empty rows were discarded, and updates arriving
before row initialization were lost. With no row, remote navigation had
nothing to select. These are demonstrated failure mechanisms; there are no
logs or visual capture from Pat's actual TV identifying its exact state.

TV v14 adds a **Related videos** action beside the main playback controls.
Select it with the remote to open the first related row below the player,
skipping chapters and explicit playlists. Normal Down navigation also remains
available. If results are loading, empty or unavailable, a focusable status
card provides a retry action. Retrying reloads suggestions, not the stream.
Explicit child-mode and disabled-suggestions settings remain respected.

Suggestions come from the playing video's WatchNext metadata, supplemented by
a search using that video's subject. They do not come from the Home feed.
Strong title matches rank first. Partial matches can survive different title
wording, with meaningful subject evidence still required. Long-title partial matches also need overlap beyond the initial half of the
title to reduce matches based only on a brand/model prefix. Channel only breaks
equal subject scores. Duplicate, current, upcoming and unplayable items are
excluded. Empty results remain visible as a retry state; unrelated Home
recommendations are not substituted. Title matching cannot guarantee semantic
relevance across translations or entirely different wording.

The TV-only `tv-player.patch` applies after `pat-sync.patch`. Mobile v20 and
the upstream pins remain unchanged. The TV recovery workflow applies this
overlay only when present in the chosen known-good TV source. Previous
release assets and manifest entries are retained. TV v14 uses package
`app.smarttube.pattv`, code 3014 and the existing production signing key.

Five Android/Robolectric tests exercise the actual player adapter, focusable
status presenter, transport action dispatch, selection of related rows after
playlists, retry selection, retained early updates, stale-row clearing and
subject ranking. The existing 14 maintenance/Java fixtures, buffer/news,
SABR and Rumble regression gates remain applicable.

No Android device is connected. Emulator acceleration reports that the
Android Emulator hypervisor driver is not installed. Automated UI tests do
not establish how the screen looks on Pat's TV or verify real playback.

## Published verification

Final APK source: `3fb35947a08b9de68771d02214958ec4cefb7346`.
The [production TV workflow](https://github.com/surinp3/smarttube-mobile/actions/runs/43580514737)
passed all regression gates and the signed release build. The local final
release build and five TV player tests also passed.

[TV v14](https://github.com/surinp3/smarttube-mobile/releases/tag/tv-v14) provides
ARMv7, ARM64 and Universal APKs. All three have package `app.smarttube.pattv`,
code 3014, no debuggable flag, and valid signatures matching the existing
production certificate
`98a5237751cecd7af6dc8e20761bbf67527ef4e1ee581f1125c0529d2537f2ba`.
All three public GitHub downloads and all three jobhub.asia mirror downloads
returned HTTP 200 and matched their signed artifact sizes and SHA-256 digests.
See [machine-readable verification](release-verification/tv-v14.json).

The updater entry uses code 3014 and the verified mirror paths. Mobile latest
remains v20. Previous TV v13 release files and manifest entries are retained;
a future in-place recovery must use an unused tv-v17/code 3017 or higher.
No signing key was changed and no app was uninstalled. The sync service health
check passed; its code and SQLite database were not changed.

The first CI attempt failed because two overlay contexts used Windows CRLF
rather than their upstream LF. That formatting was corrected and a Linux-style
checkout replay matched the tested Java source. The final source also avoids
Java Stream APIs unavailable on Android 6. Local release assembly succeeded,
but Java 11 could not load the existing WorkManager lint registry compiled for
Java 17; full lint coverage is not claimed. Device appearance, real remote
operation, recommendation quality and actual TV playback remain unverified.
