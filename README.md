# SmartTube Mobile

Mobile-friendly Android phone edition of [SmartTube](https://github.com/yuliskov/SmartTube).

Version **v11** includes:

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
plus [mobile.patch](mobile.patch) and [mediaservice.patch](mediaservice.patch),
which are kept compatible with that commit and its MediaServiceCore submodule.

**Install production APKs only from [GitHub Releases](https://github.com/surinp3/smarttube-mobile/releases).**
Ordinary Actions artifacts are disposable **DEBUG-TEST-ONLY** builds used to
verify code changes; they are not the distribution channel and will not update
an installed production APK.

### Seamless Android updates

Android only permits in-place APK updates with the **same signing key**.
All pre-release versions through v11 were debug-signed, so moving to the first
production release will require one uninstall/reinstall. Back up anything
important before that one-time transition. Then a permanent signing key lets
later releases update the existing app and preserve its data.

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
secret is configured**. The push automatically creates a `v11` GitHub release
with a permanently signed APK. A manual GitHub Actions run on `main` with
`publish_release=true` can also publish if needed. Future versions must
increment both `MOBILE_VERSION` and the workflow's release version/tag. The
updater uses the latest published release, not Actions artifacts.

Android requires the user to approve installing updates from this source once.
