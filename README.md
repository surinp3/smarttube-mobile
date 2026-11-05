# SmartTube Mobile

Mobile-friendly Android phone edition of [SmartTube](https://github.com/yuliskov/SmartTube).

Version **v9** includes:

- YouTube account activation using SmartTube's existing sign-in, with live
  account subscriptions and history in the phone interface, including
  scrolling through older items.
- Five-item bottom navigation (Home, Subs, History, Search, Settings), Back
  controls, and native touchscreen search.
- More legible video cards with 16:9 thumbnails, title/author spacing, and
  duration badges (including LIVE).
- Clean account/switching and advanced-settings entry screen.
- Settings → Check for updates, which downloads the next signed ARM64 APK
  directly inside the app, verifies the package/version and SHA-256 when
  available, and starts Android's confirmation-based APK installer.
- A resilient YouTube activation flow that continues polling after temporary
  connection failures; authorized tokens are saved before account enrichment.
- Settings → YouTube DNS to choose Android system, IPv4-preferred, or Google
  Public DNS (clearly marked because it may bypass phone-level Private DNS).

The original 52-channel signed-out Home fallback remains available.

## Build

GitHub Actions builds the ARM64 APK from a pinned upstream SmartTube commit
plus [mobile.patch](mobile.patch) and [mediaservice.patch](mediaservice.patch),
which are kept compatible with that commit and its MediaServiceCore submodule.

Download development builds from the **Actions** tab → latest successful
“Build SmartTube Mobile APK” run → APK artifact.

### Seamless Android updates

Android only permits in-place APK updates with the **same signing key**.
The v6 builds were debug-signed, so an uninstall/reinstall may be necessary
when moving to the persistent signing key.

For future releases, create one private Android signing keystore and save it
in the GitHub Actions secrets (never commit the keystore or passwords):

- `MOBILE_KEYSTORE_B64`: base64 encoding of the keystore file
- `MOBILE_STORE_PASSWORD`: keystore password
- `MOBILE_KEY_ALIAS`: key alias
- `MOBILE_KEY_PASSWORD`: key password

When all four are configured, the workflow builds with the persistent release
key. Without them it produces a **debug test APK only**. A debug build from one
GitHub Actions runner is generally signed with a different key than another;
it cannot be installed as an update over a build signed with another key. Set
up the release signing key **once**, back it up securely, and use it for every
future release.

To publish an update, run **Build SmartTube Mobile APK** manually from GitHub
Actions and select `publish_release=true`. That creates a `v9` GitHub
release with the signed APK. Future mobile versions should increment both the
app's `MOBILE_VERSION` and the workflow's release version/tag.

The in-app updater reads the latest published GitHub release, not Actions
artifacts. It works after a signed release is published, and Android requires
the user to approve installing updates from this source. Updating from the
current ephemeral debug-signed APK to the first persistently signed release
will require a one-time uninstall/reinstall; subsequent releases signed with
the same key can update in place and preserve app data.
