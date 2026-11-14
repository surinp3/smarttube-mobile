# Mobile v22 / TV v16: fuller news with verified Swedish sources

The Swedish follow-up adds **EFN Ekonomikanalen** and **Dagens industri**, which
were absent from the source/publisher list. A new live app-client probe verified
**4 Swedish videos** (2 from each publisher) and **24 English videos**, **28 in
total**, with zero Thai accepted. The added Swedish material is business and
economics news/interviews; this does not establish availability of a broad
Swedish general-news feed. See [live counts and examples](release-verification/swedish-news-live-20261114.json).
No claim of Swedish availability is based solely on fixture tests.

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

The bounded search plan uses at most nine requests with a separate 12-second
request-start budget per language, so slow Swedish sources cannot suppress English;
active news search calls are cancelled after six seconds. Source failures
preserve successful results from other sources. Missing current videos are not
padded with old or unrelated items. Consequently 48 is a target, not a promise.
No global locale, playback settings, backend or SQLite data are changed.

The initial v21 app-client probe on 2026-11-14 returned **24 accepted English news
videos**: BBC News 8, Sky News 8, Reuters 5, ABC News 1, CBS News 1 and NBC News 1.
The Swedish publisher searches yielded no qualifying fresh videos during this
probe. Rejected Swedish matches included SVT Humor, history, archive uploads
and unrelated/Thai results. See [captured counts and examples](release-verification/news-live-20261114.json).
This verifies a substantial current English selection, not Swedish availability
or signed-in device behavior. News results change over time.

Eight Android/Robolectric regressions cover the one-item primary case,
multi-publisher filling to 48, duplicate removal, per-publisher limits, source
failure, all-empty results, Thai/unrelated/stale rejection, real combined TV
author/date metadata, newly added Swedish business publishers and the actual supported date-filter encoding. Existing
locale, buffer, SABR, TV player and Rumble checks remain in the build workflows.

`news-mediaservice.patch` applies after the existing MediaService patch;
`news.patch` adds the regression tests after `pat-sync.patch`. Recovery replays
these overlays only when they exist in the selected known-good source.
Mobile v22 uses code 2475; TV v16 uses 3016. The permanent signing key, previous
release assets and in-place higher-version recovery path are preserved.

Actual phone/TV rendering, playback and remote operation are not verified.
No device is connected; emulator acceleration is unavailable.

## Mobile v21 / TV v15 published verification

Final APK source: `1de529762bf497991de79e43b8a7c6552917172d`.
Both production workflows passed all gates and signed assembly:
[Mobile](https://github.com/surinp3/smarttube-mobile/actions/runs/43603612109),
[TV](https://github.com/surinp3/smarttube-mobile/actions/runs/43603612117).
The 14 maintenance checks, seven news-feed cases, two locale cases, six buffer
cases, six SABR cases, two Rumble cases and five TV player cases passed where
applicable. Both local release assemblies also succeeded.

[Mobile v21](https://github.com/surinp3/smarttube-mobile/releases/tag/v21) and
[TV v15](https://github.com/surinp3/smarttube-mobile/releases/tag/tv-v15) are
published. All four APKs passed package, code, ABI, non-debug and signature
verification against the permanent production certificate
`98a5237751cecd7af6dc8e20761bbf67527ef4e1ee581f1125c0529d2537f2ba`.
Four complete GitHub downloads and three complete TV mirror downloads returned
200 and matched the signed artifact sizes and SHA-256 digests. Mobile latest
is v21; the TV updater uses code 3015 and verified tv-v15 mirror paths.
See [artifact and public-download evidence](release-verification/news-v21-tv-v15.json).

Previous v20/tv-v14 assets and TV manifest history remain. Future in-place
recovery needs unused v23/tv-v18 or higher and codes at least 2476/3018.
The sync health check passed; backend code and SQLite were not changed.
Existing Java 11/WorkManager lint-registry compatibility warnings remain;
full lint coverage is not claimed. Real device behavior remains unverified.


## Mobile v22 / TV v16 published verification

Final APK source: `a852e889b46c366d3c43a1d58883ab8bd2f06f54`.
[Mobile CI](https://github.com/surinp3/smarttube-mobile/actions/runs/43605400544)
and [TV CI](https://github.com/surinp3/smarttube-mobile/actions/runs/43605400475)
succeeded, including eight news regressions and the existing playback, locale,
buffer, Rumble, TV player and maintenance gates. Both local release assemblies
also passed. A fresh Linux-style patch replay matched the tested source.

[Mobile v22](https://github.com/surinp3/smarttube-mobile/releases/tag/v22) uses
code 2475; [TV v16](https://github.com/surinp3/smarttube-mobile/releases/tag/tv-v16)
uses 3016. All four APKs passed signature, permanent-certificate, package, ABI
and non-debug checks. All four public GitHub downloads and three TV mirror
downloads returned 200 and matched the signed artifact sizes and SHA-256
hashes. Mobile latest is v22. The TV updater entry uses code 3016 and the
verified tv-v16 mirror paths. See [release evidence](release-verification/news-v22-tv-v16.json).

The live probe verifies four Swedish publisher clips and 24 English items,
not 24 Swedish items or a broad Swedish general-news selection. Counts and
availability change over time. Real phone/TV rendering, remote operation,
spoken audio language and actual playback remain unverified. Previous
v21/tv-v15 releases and manifest history remain; future recovery requires
unused v23/tv-v18 or higher and codes at least 2476/3018. The sync service
health check passed, and backend code/SQLite were unchanged.
