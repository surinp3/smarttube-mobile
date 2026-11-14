# SmartTube Pat TV

Google TV edition of SmartTube, built alongside—not instead of—the SmartTube Mobile app.

- Install package: `app.smarttube.pattv`. Google TV Streamer can run 32-bit Android apps even when its CPU is 64-bit; use the ARMv7 APK if the ARM64 APK reports `INSTALL_FAILED_NO_MATCHING_ABIS`, or the universal APK for either ARM architecture.
- Upstream source and MediaServiceCore revisions are pinned for reproducible builds.
- Prefers the downgraded TV client, which is capable of direct streams, with the original TV and other clients preserved as fallbacks. YouTube may change which clients are functional.
- Adaptive temporary VOD read-ahead up to ten minutes or a memory-safe target up to 500 MB, with 3-second start and 7-second rebuffer targets. Live/unknown streams stop at 30 seconds; low-buffer mode keeps five seconds. No offline/full-video download is promised.
- After 12 seconds of cumulative buffering within a minute, TV VOD playback tries another client rather than blindly reloading the same one. SABR reload-token fixes from the pinned upstream revision remain in place.
- Never silently changes a user's DNS preference to Google DNS during stall recovery.
- Separate signed `tv-v13` release with ARMv7, ARM64 and universal options, not test APKs; signed with the permanent signing secret so future updates can install over them.
- Player suggestions rank by watched subject first and channel second. News requests prefer Swedish/Sweden coverage, with English breaking news as a fallback. See [behavior and validation](DISCOVERY_AND_BUFFERING.md).
- **Follow on Rumble** in the YouTube player controls looks up the creator.
  Choose a channel to save it to your synced SmartTube follows.
- The main sidebar opens **YouTube**, **Rumble** or **Both**. **Both** mixes
  YouTube and matching Rumble videos in each category, including videos from
  Rumble channels you do not follow.
- Home uses the same mixed categories in a vertical grid. It starts with
  **Recent from your channels**, mixing YouTube subscriptions and Rumble videos
  by upload date. Rumble cards show the channel name and upload date when available.
- Video cards show rounded corners, a focus frame, a source icon and a title below the thumbnail.
- **Settings → Rumble + Bunny sync** opens the shared browser and pairing controls.
  Enter the TV's 10-digit code in the mobile app to connect it to the hosted
  sync service.
- In-app update checker reads `tv_update.json` on main, rather than the upstream SmartTube update manifest. Update this JSON and release URL with every future TV release.
- No claims of zero buffering: actual performance depends on CDN, ISP, YouTube API changes and the attached device. Test on the Google TV Streamer before judging reliability.

The app runs the standard SmartTube TV/remote-control interface; the phone-specific activity only runs in the separate `stmobile` variant. The distinct package ID means the official TV app can remain installed for comparison.

For ongoing protection against YouTube playback changes and for a manual
signed in-place rollback to a known-good TV release, see
[Upstream checks and safe rollback](UPDATES_AND_RECOVERY.md).
