# SABR playback recovery: Mobile v19 and TV v12

This change addresses reproducible failure mechanisms in the pinned playback
code. The reported phone/TV error has not yet been captured in a device log,
and real YouTube playback must still be confirmed on both devices.

## Diagnosis and upstream review

- `SabrProcessor.processStreamProtectionStatus` throws `SabrPoTokenError` on
  the first non-OK protection response, including `ATTESTATION_PENDING`.
  A transient response therefore aborts a stream that could subsequently pass.
  Upstream first removed that error, then on November 13 restored propagation
  after **two consecutive failures** to avoid leaving rejected tokens buffering
  indefinitely. This patch follows the newer bounded behavior and resets the
  failure count after `OK`.
  See [upstream SABR correction](https://github.com/yuliskov/SmartTube/commit/da643a87d2ee3c48cc868eb65502e5b27e0884a5).
- The pinned `VideoInfoService` resets its client playback nonce once before
  trying multiple clients. All fallback attempts consequently reuse the same
  nonce. Upstream's [PoToken attestation fix](https://github.com/yuliskov/MediaServiceCore/commit/b3d561f53cedca04d642b6e7f914f19b4536ce69)
  resets it for every provider/client attempt. The pinned implementation still
  owns its legacy client loop in `VideoInfoService`, so this backport moves the
  reset into that loop. Its separate Innertube provider already resets its nonce.
- Upstream [reduced SABR reload/backoff retries](https://github.com/yuliskov/SmartTube/commit/aa862d40c8f21bfa6a7d4e63ef4a7768ff24b78b)
  from three to one. The shared patch adopts that limit before the existing
  client recovery path takes over. The first reload still sends the server's
  reload-playback token. The TV patch continues to preserve the user's DNS
  selection; no new automatic DNS change is introduced.

These are focused backports, keeping `upstream-pins.json` unchanged. The current
upstream comparison also contains client-selection refactors and unrelated UI
changes. The watcher should continue to report those unreviewed updates.

## Regression checks

Apply the patches in the order documented by each build workflow. With Java 11
and an Android SDK configured, run from this repository:

```sh
SMARTTUBE_SOURCE_DIR=/path/to/patched/upstream python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The two Java fixtures compile and execute the actual nonce-selection and SABR
retry methods extracted from the patched checkout, replacing network/player
dependencies with deterministic fixtures. They cover failed-client fallback,
the second format-search pass, consecutive video loads, null video IDs, reload
tokens, retry exhaustion, and successful-play/new-video retry resets. Both
fixtures fail against the original pins and pass after this patch.

From the patched upstream checkout:

```sh
./gradlew :exoplayer-library-sabr:testStstableDebugUnitTest --tests '*SabrProtectionStatusTest' --stacktrace
./gradlew :smarttubetv:assembleStmobileDebug --stacktrace
./gradlew :smarttubetv:assembleStpattvDebug --stacktrace
```

`SabrProtectionStatusTest` exercises the actual processor and generated protobuf
messages: pending-to-OK with/without a token, persistent rejection, resume,
successful-attestation counter reset, and independent stream counters. Both
build workflows run these checks before assembling an APK.

Local validation on November 13, 2026:

- Six processor tests passed (zero failures/errors/skips).
- Ten maintenance/control-flow checks passed with each app's patched source.
- The two new control-flow fixtures fail against the old code: the nonce trace
  is `[1, 1, 1]` across three clients, and the second SABR reload is still accepted.
- Mobile debug APK assembly passed using Java 11 and Gradle 7.5.
- TV debug APK assembly passed, including ARMv7, ARM64, and universal APKs.
- Both complete patch stacks apply to their original pinned sources. Patch
  context keeps the pinned files' CRLF bytes, including MediaServiceCore patches.

The first offline test attempt lacked `com.google.auto.value:auto-value:1.6`;
fetching the missing Maven test dependencies allowed the processor tests to pass.
An overlapping local Gradle invocation failed with missing ExoPlayer core symbols;
the subsequent sequential mobile build passed. Build/test success is separate
from on-device playback verification.
ADB listed no attached devices, so device logs and phone/TV playback remain
unverified. Initial local debug APKs retain the v18/tv-v11 version names; they are
validation artifacts, not production updates.

## Signed release and rollback

Publication was approved on November 14. Mobile v19 uses versionCode 2472;
TV v12 uses versionCode 3012. Release builds use the existing permanent signing
secret. Source pins, the sync service, and its SQLite database are unchanged.
No app is uninstalled or automatically installed. Exercise
fresh playback, resume/seek, live streams, subtitles, a sustained VOD session,
YouTube sign-in/history, and the preserved Rumble/sync flows on the phone and
Google TV Streamer. Debug APKs cannot update installed production APKs.

Previous releases and their assets remain available. If recovery is needed,
select a source release confirmed to work on the device in the manual recovery
workflow. For example, restoring the previous v18/tv-v11 sources would require
unused release numbers higher than every published version and versionCodes
higher than the currently installed build. After Mobile v20 / TV v13, that
means at least v22/tv-v16 with codes 2475/3016. Use the
existing signing key and install the recovery in place. The recovery workflow
now also applies the selected source's `pat-sync.patch`, preserving its mobile,
Rumble and sync features before the recovery version is raised.

## Publication verification (November 14)

Both signed workflows succeeded for commit
`50fab7e1364fc196fa4f447280e428411e797e4f`:
[Mobile build](https://github.com/surinp3/smarttube-mobile/actions/runs/43545991297)
and [TV build](https://github.com/surinp3/smarttube-mobile/actions/runs/43545991207).
The [Mobile v19](https://github.com/surinp3/smarttube-mobile/releases/tag/v19)
and [TV v12](https://github.com/surinp3/smarttube-mobile/releases/tag/tv-v12)
releases were published after verifying all four APKs. Each has the expected
package ID, higher versionCode, required ARM architecture, no debuggable flag,
and valid v1/v2 signatures matching the previous production certificate:
`98a5237751cecd7af6dc8e20761bbf67527ef4e1ee581f1125c0529d2537f2ba`.

The unauthenticated latest-release API returns Mobile v19. Public GitHub APKs
and all three TV mirror copies were downloaded and matched to the signed
release SHA-256 digests. TV updater versionCode 3012 uses the existing
`jobhub.asia/downloads/smarttube-tv/tv-v12/` mirror, preserving previous manifest
entries and downloads. No sync backend or SQLite database was deployed or changed.
Phone and Google TV playback still require device confirmation.
