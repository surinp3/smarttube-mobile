# SmartTube Pat: upstream checks and safe rollback

Both apps are production-signed and use their own update channels:

| Edition | Android package | Published versions | In-app update source |
| --- | --- | --- | --- |
| Phone | `app.smarttube.mobile` | `v13`, `v14`, ... | Latest GitHub `vN` mobile release |
| Google TV | `app.smarttube.pattv` | `tv-v2`, `tv-v3`, ... | [`tv_update.json`](tv_update.json) on `main` |

## Monitor original YouTube playback code

The source revisions in [`upstream-pins.json`](upstream-pins.json) are used by
both build workflows. Twice daily, at approximately **09:17 and 21:17 Bangkok
time**, the [Check SmartTube upstream playback
workflow](.github/workflows/check-upstream.yml) compares those revisions with
the official `yuliskov/SmartTube` and `yuliskov/MediaServiceCore` `master`
branches. Every mobile/TV build repeats a read-only comparison.

Changes in YouTube stream extraction, InnerTube, playback clients, SABR,
ExoPlayer, buffering, or the MediaServiceCore dependency automatically open
or refresh a single GitHub issue with the upstream comparison links and changed
file names. After compatible pinned revisions are adopted, the issue closes.

**This is an early-warning system, not an auto-update of third-party code.**
YouTube can break playback without any upstream commit, and an upstream commit
is not necessarily compatible with our custom features. Before publishing
changes, review the upstream diff, update both pinned SHAs and patches as
needed, build both apps, and verify sign-in, video loading and playback on
the actual Android phone and Google TV Streamer.

## Restore the last working version over a broken update

Older APKs ordinarily cannot be installed over newer Android app versions.
Uninstalling first can delete sign-in and settings. The repository includes a
manual **production recovery workflow** that rebuilds the selected working
release's original code with a *higher* Android `versionCode`, signed with the
existing permanent signing key. It is a normal in-place update, not a
downgrade in Android's eyes.

1. Open [GitHub Actions → Restore known-good SmartTube
   release](https://github.com/surinp3/smarttube-mobile/actions/workflows/recovery-release.yml)
   and select **Run workflow** on the `main` branch.
2. Choose `tv` or `mobile`.
3. Enter the **known-good published release tag**, for example `tv-v2` or
   `v13`. It must have worked on your device.
4. Choose the **next unused release number** for that app, higher than all
   published numbers. For example, if TV `tv-v3` broke, enter `4` to publish
   `tv-v4` from the `tv-v2` source.
5. Enter a **new Android versionCode higher than the broken installed app**, 
   and higher than the current patch's versionCode. For example, if the
   broken TV app has code `3003`, choose at least `3004`; if broken Mobile
   has code `2467`, choose at least `2468`.
6. Start the workflow and wait for the signed production release. The TV
   updater manifest will point to the new recovery release automatically;
   the mobile in-app updater will use the newly published latest `vN` release.
   You may alternatively install the matching APK from GitHub Releases.

The workflow checks that the source release exists, that the new public
version is unused and higher, and that the Android versionCode exceeds the
known-good and current source versions. It refuses to publish an APK without
the permanent signing key. An APK built with a different signing key would
not be installable over an existing production app.

**Do not uninstall first** if preserving settings matters. Android still
asks you to confirm installation from the selected source. The original
working GitHub releases remain available, and the TV and phone remain on
separate channels.

### Important limitations

- This workflow is deliberately **manual**, so a known-good source is only
  restored when explicitly selected. It does not automatically roll back
  after stalls or failed playback.
- The recovery build restores the **application code**, not an exact binary
  copy. It requires the original upstream commits and dependencies to remain
  available and compatible with the build environment.
- An in-place update normally preserves app data but cannot guarantee it if
  the broken release already modified that data incompatibly. Keep backups of
  important settings where supported.
- After a recovery, future normal releases must use an Android versionCode
  **higher than the recovery versionCode**; merely incrementing a public
  version name is insufficient.
- The recovery pipeline's unit tests cover version selection and TV updater
  routing. A real signed recovery APK should be exercised on the device before
  relying on this for a critical upgrade.
