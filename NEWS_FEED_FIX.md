# Mobile v21 / TV v15: a fuller current news section

The previous news loader stopped after any Swedish result, even one video,
and disabled continuation. It could therefore leave the whole News section
with a single item and never request English breaking news.

The fix collects up to 24 Swedish and 24 English news videos across several
publisher searches. English filling runs even when a Swedish result exists.
Requests explicitly use Swedish/Sweden or English/UK, independent of device
location and account personalization. Videos are deduplicated globally and
each publisher contributes at most eight per language. Publisher identity is
parsed before TV metadata's view counts and relative dates.

Live investigation found that upstream's search parameter table has no entry
for Today + Video + Newest: that combination silently omitted the entire
filter, returning old broadcasts. The fix uses the supported Today parameter,
which already encodes video type. It also rejects explicit dates and parsed
English/Swedish relative ages older than 48 hours. Results are sorted by the
available date metadata. Unknown timestamps rely on the server's Today filter.
Known publishers are required, so newly uploaded history, satire and archive
clips do not qualify merely because their titles mention Sweden or news.
Thai-script headlines/authors remain excluded.

The bounded search plan uses at most seven requests and a refresh deadline;
active news search calls are cancelled after six seconds. Source failures
preserve successful results from other sources. Missing current videos are not
padded with old or unrelated items. Consequently 48 is a target, not a promise.
No global locale, playback settings, backend or SQLite data are changed.

The live app-client probe on 2026-11-14 returned **24 accepted English news
videos**: BBC News 8, Sky News 8, Reuters 5, ABC News 1, CBS News 1 and NBC News 1.
The Swedish publisher searches yielded no qualifying fresh videos during this
probe. Rejected Swedish matches included SVT Humor, history, archive uploads
and unrelated/Thai results. See [captured counts and examples](release-verification/news-live-20261114.json).
This verifies a substantial current English selection, not Swedish availability
or signed-in device behavior. News results change over time.

Seven Android/Robolectric regressions cover the one-item primary case,
multi-publisher filling to 48, duplicate removal, per-publisher limits, source
failure, all-empty results, Thai/unrelated/stale rejection, real combined TV
author/date metadata and the actual supported date-filter encoding. Existing
locale, buffer, SABR, TV player and Rumble checks remain in the build workflows.

`news-mediaservice.patch` applies after the existing MediaService patch;
`news.patch` adds the regression tests after `pat-sync.patch`. Recovery replays
these overlays only when they exist in the selected known-good source.
Mobile v21 uses code 2474; TV v15 uses 3015. The permanent signing key, previous
release assets and in-place higher-version recovery path are preserved.

Actual phone/TV rendering, playback and remote operation are not verified.
No device is connected; emulator acceleration is unavailable. Final signed
artifact, public-download and updater checks are recorded after publication.
