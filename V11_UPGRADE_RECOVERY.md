# TV v11 update recovery

Pat reported “Error updating … null path” while running v11. The exact TV
failure has not been reproduced on a connected device. The shipped downloader
reports every exhausted/failed download as `Error while download. Install path
is null`, so that message does not establish whether the cause is network,
storage, permissions or timeout.

## What was verified

- The actual published TV v11 Universal APK is `app.smarttube.pattv`, code
  3011, version `32.69-tv.11`. Its certificate SHA-256 is
  `98a5237751cecd7af6dc8e20761bbf67527ef4e1ee581f1125c0529d2537f2ba`, the same
  permanent certificate used for current production releases.
- Release source `930f9fe3759fa05eefe6bf8ab2bc80060c25e10f` pins SmartTube
  `c8873b539d8463b3276d54e395f94e5cd2bd3198` and SharedModules
  `5b6b5d1d3ba670e3f89edef1d1394a7562251f2c`. The original v11 manifest parser
  is frozen as a test fixture, with provenance and a normalized source hash.
- That original parser accepts the real public v16 response, identifies code
  3016 as newer than 3011 and selects the correct ARMv7/ARM64 package. It also
  accepts the ABI-specific and universal cross-host fallback arrays used by the
  recovery delivery format.
- Before changing the downloader, its original code downloaded the actual v16
  ARMv7 APK through jobhub.asia in about 6.9 seconds and GitHub in about 5.0
  seconds. Both returned a non-null path, 45,729,827 bytes and SHA-256
  `b8938cd78cb1b5af58ac85310ef9f190bc5262f6dd41c3b7fe821fa3e79304a9`.
  See [the original-client live probe](release-verification/v11-live-upgrade-probe.json).

Thus v11 is compatible with the current response and signed APK; it is not
universally unable to self-update. This does not prove Pat's connection/cache
will work. V11 hard-codes a 60-second transfer cutoff and turns it into a zero
reported byte count, which then becomes the generic null-path error. Other
download failures produce the same message. A new APK cannot change that old
code before it has been installed.

## Recovery changes in TV v17

The manifest supplies both jobhub.asia and GitHub URLs for each ARM ABI and
for the Universal fallback. V11 already understands those arrays, so a failed
primary host can fall through to another host without requiring a new parser.

V17 allows APK transfers up to 15 minutes, with the existing connection/read
timeouts still active; uses a larger transfer buffer; rejects HTTP errors and
known truncated bodies; saves into a temporary APK before replacing the cached
completed file; preserves useful download errors; and reports missing or
invalid cached APKs before trying to install. It never deletes app settings or
user data. Mobile v22 is unchanged.

Nine Android/Robolectric cases exercise the frozen v11 parser, the live-format
ABI selection, alternate URLs, transfers beyond one minute, timeout and length
errors, real local HTTP host failover, cached-file preservation, error causes,
and the installer's content URI/read permission. Installer handoff is tested;
an actual Android package replacement is not, because no device is attached.

## Safe manual recovery if v11 still cannot download

1. Download the **Universal** production APK from the
   [TV v17 release](https://github.com/surinp3/smarttube-mobile/releases/tag/tv-v17).
   While v17 is being prepared, the already verified
   [TV v16 Universal APK](https://jobhub.asia/downloads/smarttube-tv/tv-v16/SmartTube-Pat-TV-v16-Universal.apk)
   is also compatible with v11. Universal covers both ARM architectures.
2. Transfer the APK to the TV using your existing file-transfer app or USB,
   then open it with the TV's file manager. Alternatively download it directly
   with an existing TV browser/download app.
3. If Android requests permission to install from that app, allow that source,
   then choose **Update/Install** over **SmartTube Pat TV**.
4. **Do not uninstall SmartTube Pat TV or clear its storage/data.** The same
   package, same certificate and higher code make this a normal in-place
   update, preserving the app's stored settings/accounts/follows.
5. Open SmartTube Pat TV and confirm its version. If Android rejects the APK,
   keep the installed app and record the exact installer error. Do not attempt
   an uninstall to get around a signing/package mismatch.

For a TV already connected to an authorized ADB session, the equivalent
non-destructive command is:

```text
adb install -r SmartTube-Pat-TV-v17-Universal.apk
```

No ADB device was connected and this command was not run. Actual TV storage,
unknown-source permission, OS installation, UI and playback remain to be
confirmed. No app was uninstalled and no signing key was changed.

Final production-build, download and updater-delivery checks are recorded
after the recovery release is published.
