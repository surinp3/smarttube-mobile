# TV v18: Rumble remote controls

The Rumble activity created a programmatic ExoPlayer `PlayerView` that was not
focusable and never requested playback focus. The header's Follow button could
retain focus after the controller hid. D-pad events therefore missed the player;
the activity also did not forward physical media keys. Back still worked because
Android handled it at the activity level.

`rumble-tv.patch` fixes this activity only in the TV build and TV recovery path.
The Mobile v22 workflow does not apply it. The YouTube player, extractor,
buffering, news, sync and updater code are unchanged.

- Playback receives initial/window focus and regains focus when controls hide.
- With controls hidden, Center/Enter pauses or resumes; Left rewinds five seconds
  and Right advances fifteen seconds, using ExoPlayer's seekability and duration
  checks. Held seek keys repeat; held pause keys toggle only once. Seeking while
  paused keeps playback paused. Non-seekable live streams ignore seek requests.
- Up/Down reveals playback controls. From the button row, Up goes to Follow and
  Down goes to the timeline; from the timeline, Up returns to playback buttons.
  Down from Follow returns to playback controls. Visible buttons and the timeline
  retain their normal ExoPlayer click and scrub behavior.
- Physical Play/Pause, Play, Pause, Fast Forward and Rewind keys reach playback
  even when Follow has focus. Center on Follow still follows the channel.
- Back first hides visible controls; the next Back exits. Repeats and the release
  of the first Back are consumed together so one held press cannot exit twice.

## Verification

Eleven regression tests use the actual Rumble activity, PlayerView, playback
buttons and timeline in Android API 28 under Robolectric, with a simulated
ExoPlayer interface. Key events go through Android's ViewRoot input pipeline,
including its ordinary focus navigation, rather than calling only a key mapper.
All eleven fail against the previous activity and pass with this fix. The suite
also checks controller timeout, activity stop/resume, reopening after Back,
missing channel/player state, seek boundaries and repeated presses.

Local verification passed 49 Android tests (11 remote, 5 TV suggestions, 9 legacy
updater, 6 SABR, 16 buffer/news, 2 Rumble news) and 14 maintenance tests. All TV
release architectures compiled. Clean replay of the root patch chain matched the
cached product source. The existing Java 17 lint-registry dependency warning
under Java 11 remains; compilation success does not establish full lint coverage.
See [the recorded baseline and regression results](release-verification/tv-v18-remote-tests.json).

The tests do not decode a Rumble stream, reproduce HDMI/CEC firmware or establish
actual TV playback. No Android device was attached for this change. After an
in-place TV v18 update, confirm Center pauses/resumes a Rumble video, Left/Right
seek, Up/Down navigate controls, Follow remains usable, and Back returns to the
browser after hiding the controls. Repeat with another video and a live stream.

TV v17 remains available. If recovery is needed after installing v18/code 3018,
rebuild a known-good TV release through the existing recovery workflow as the
next unused release, at least v19/code 3019. Keep the permanent signing key and
install over the existing app; do not uninstall or clear app storage.

## Published artifacts

[TV v18](https://github.com/surinp3/smarttube-mobile/releases/tag/tv-v18) contains
ARMv7, ARM64 and Universal APKs with package `app.smarttube.pattv`, code 3018 and
version `32.69-tv.18`. The production signing certificate remains
`98a5237751cecd7af6dc8e20761bbf67527ef4e1ee581f1125c0529d2537f2ba`.
All three published APK identities, signatures, architectures, remote-control
methods and GitHub digests were verified. All six full downloads (GitHub and VPS
mirror for each APK) returned HTTP 200 with matching sizes and SHA-256 hashes.
The Mobile latest release and original v22 asset fingerprint are unchanged.
See [signed artifact and delivery evidence](release-verification/tv-v18-delivery.json).
