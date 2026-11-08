# SmartTube Mobile

Mobile-friendly Android phone edition of [SmartTube](https://github.com/yuliskov/SmartTube).

Version **v16** adds **Follow on Rumble** to the YouTube player controls. Choose a matching channel to save it to your synced SmartTube follows.

- **Both** mixes YouTube and Rumble in the Home feed. Rumble uses followed
  channels or shows live videos when you have no follows.
- A Rumble player using HTTPS HLS or MP4 with alternate-stream recovery after
  repeated stalls. Local Rumble follows and watched positions are saved.
- **Settings → Rumble + Bunny sync** opens a shared phone/TV video browser.
  On the TV, open **Settings → Rumble + Bunny sync**. It has a D-pad sidebar
  of followed Rumble channels; long-press a channel to move it up.
- Phone-only initial Bunny authorization and 10-digit TV pairing. The phone
  approves the TV; no database token, Rumble API key, or setup secret is
  typed on the TV. Settings, channels/sidebar and Rumble progress can sync.
  The hosted [sync service](https://jobhub.asia/health) uses a private SQLite
  database. The app still labels the settings screen **Rumble + Bunny sync**.

The earlier v13 interface includes:

- **Settings → Home screen → Hide Shorts on Home** (enabled by default).
  Removes Shorts from YouTube's Home recommendations, including paginated
  results, while leaving Search, Subscriptions and History unchanged.
  The preference is saved on the device and can be switched off at any time.

- Top-aligned thumbnail cropping: portrait and unusually proportioned YouTube
  images now show their upper portion instead of cutting off faces and headings.
  Cards retain their existing 16:9 dimensions and rounded corners.
- YouTube's **normal, personalized Home recommendations**. One batch is
  displayed in YouTube's returned order; subscription uploads and curated
  searches are no longer forcibly mixed into Home. Subscriptions remain in
  their own tab. A YouTube sign-in is required for this Home API.
- YouTube account activation using SmartTube's existing sign-in, with live
  account subscriptions and history in the phone interface, including
  scrolling through older items.
- Five-item bottom navigation (Home, Subs, History, Search, Settings), Back
  controls, and native touchscreen search.
- More legible video cards with 16:9 thumbnails, title/author spacing, and
  duration badges (including LIVE).
- Red watched-progress lines on video thumbnails. Uses the watched percentage
  returned by YouTube for the signed-in account (including other devices) and
  SmartTube's existing local fallback. Existing playback already resumes from
  the account position when available.
- Clean account/switching and advanced-settings entry screen.
- Settings → Check for updates, which downloads the next signed ARM64 APK
  directly inside the app, verifies the package/version and SHA-256 when
  available, and starts Android's confirmation-based APK installer.
- A resilient YouTube activation flow that continues polling after temporary
  connection failures; authorized tokens are saved before account enrichment.
- Settings → YouTube DNS to choose Android system, IPv4-preferred, or Google
  Public DNS (clearly marked because it may bypass phone-level Private DNS).

## Build

GitHub Actions builds the ARM64 APK from a pinned upstream SmartTube commit
plus [mobile.patch](mobile.patch), [pat-sync.patch](pat-sync.patch)
and [mediaservice.patch](mediaservice.patch),
which are kept compatible with that commit and its MediaServiceCore submodule.

**Install production APKs only from [GitHub Releases](https://github.com/surinp3/smarttube-mobile/releases).**
Ordinary Actions artifacts are disposable **DEBUG-TEST-ONLY** builds used to
verify code changes; they are not the distribution channel and will not update
an installed production APK.

### Seamless Android updates

Android only permits in-place APK updates with the **same signing key**.
Early development builds were debug-signed. Production versions starting at
v11 use a permanent signing key. Moving from a debug build to the production
line requires a one-time uninstall/reinstall. Later signed releases update the
existing app and preserve its data.

For production releases, create one private Android signing keystore and save
the signing bundle as **one** GitHub Actions repository secret, named
`MOBILE_SIGNING_BUNDLE_B64`. Its value is the single-line Base64 encoding of a
ZIP archive containing these two files:

```text
keystore.properties
smarttubetv/mobile-release.jks
```

`keystore.properties` contains `storeFile=mobile-release.jks`, `storePassword`,
`keyAlias`, and `keyPassword`. Never commit or publish the bundle, its plaintext
credentials, or the keystore. Back up the signing bundle privately: without it,
subsequent production APKs cannot update previous installations.

The original **four-secret** signing configuration also remains supported:

- `MOBILE_KEYSTORE_B64`: base64 encoding of the keystore file
- `MOBILE_STORE_PASSWORD`: keystore password
- `MOBILE_KEY_ALIAS`: key alias
- `MOBILE_KEY_PASSWORD`: key password

The signing secret is read **only for trusted `main`-branch release builds**,
never pull-request builds. Production builds fail if signing is missing. All
other builds are explicitly marked debug/test-only.

To publish an update, merge the new version into `main` **after the signing
secret is configured**. The build stages the signed GitHub release as a draft
with a permanently signed APK. A manual GitHub Actions run on `main` with
`publish_release=true` can also stage the draft. Verify the signing certificate
before publishing. Future versions must
increment both `MOBILE_VERSION` and the workflow's release version/tag. The
updater uses the latest published release, not Actions artifacts.

Android requires the user to approve installing updates from this source once.

### Upstream changes and recovery

Every build checks the official SmartTube and MediaServiceCore sources for
YouTube fetching and playback changes. A scheduled watcher also runs twice a
day and creates a GitHub issue if the relevant upstream code changes. An
upstream update is **reviewed**, not blindly merged into the production app.

If an update breaks playback, the GitHub Actions **Restore known-good
SmartTube release** workflow can publish a *higher-version*, production-signed
APK rebuilt from the last working source. That installs over the broken app
without first uninstalling. See [Upstream checks and safe
rollback](UPDATES_AND_RECOVERY.md) for the exact procedure and limitations.
