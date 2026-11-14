# Mobile v20 / TV v13: discovery and temporary buffering

## Suggestions while watching

The shared player previously displayed YouTube's returned rows without a local
relevance requirement. Its open-panel guard could also keep the previous video's
suggestions visible after selecting a different video.

Player recommendations now require meaningful title overlap with the watched
subject, including a specific focus beyond generic brand/model prefixes.
Stronger subject matches sort first; the current channel only breaks equal
subject scores. Generic words, duplicates, the current video, upcoming and
unplayable items are excluded. Recommendation rows are also ordered by their
best subject match. Sparse results get one title-subject search, which passes
the same relevance filter. There is no generic trending/live fallback.

Each new video clears stale rows. Generation checks reject late metadata,
continuation and search callbacks, including switching A → B → A. Cast queues are extracted before the remaining recommendation rows are ranked. Continuation
results are filtered again and replace the ranked row; repeated cursor tokens
are blocked and automatic page filling is bounded. Explicit playlists, playback
queues, chapters, child mode and disabled suggestions keep their existing rules.

This is conservative, local title-based matching, not transcript analysis or a
semantic model. Ambiguous titles, translations and different wording can produce
fewer results. It prefers an empty result to padding the player with unrelated
videos. Real recommendation quality still needs confirmation on the devices.

## News preference

Dedicated YouTube News requests explicitly use Swedish / Sweden (`sv`, `SE`),
including canonical `hl`/`gl` and TV compatibility fields. They do not change
global app/account language or region. Results require a recognized Swedish
publisher or a Sweden-related headline, and Thai-script headlines/authors are
rejected. If those rows are empty or unavailable, an explicit English / UK
request (`en`, `GB`) may supply English breaking-news rows or headlines. It
never falls back to device-local Thai news. News rows are bounded snapshots;
unscoped continuation tokens are not used. Refresh fetches new preferred news.

Automatic Rumble news seeds use a shared `breaking news` query and require an
English breaking headline; Thai and unrelated results are discarded. News-topic
Rumble additions use the same policy. Explicit followed channels and manual
searches retain the user's choices. Missing automatic news is not replaced by
random live videos. The existing API cache/quota behavior remains in place.

Language checks combine explicit requests, publisher/headline evidence and
script filtering. They do not inspect spoken audio or prove a story's location.
Live personalized news responses have not been checked on a signed-in device.

## Temporary playback buffer

The player can read ahead encoded VOD media, up to ten minutes or its byte
target, whichever stops it first. The target is the smaller of **500,000,000
bytes**, one quarter of the app's maximum heap, one third of currently available
heap, and the existing physical-memory allowance where supplied. Small or busy
heaps therefore use much less than 500 MB. This is an allocator target, not a
promise that total process RAM stays below that number; renderers and other app
features also use memory, and a final allocation/chunk can overshoot slightly.

Live and unknown-duration streams stop read-ahead at 30 seconds. The explicit
low-buffer profile keeps its five-second behavior. Startup/rebuffer targets are
3/7 seconds in adaptive mode. YouTube and the Rumble player use the same policy.
The prior TV-only medium-buffer override is superseded by this shared control.

Consumed media is discarded without a retained back buffer. The unused
allocation pool resets on completion, stop, release and preparation of the next
video. Normal seeks remain supported and can refetch discarded data. The Rumble
activity releases its player when abandoned. No temporary media files are
written, so there is no growing disk cache or media-file cleanup debt.

This is **not a full-video/offline downloader or a guaranteed 500 MB download**.
SABR uses session-bound POST requests and server-controlled delivery; copying
them into a generic disk prefetch/cache risks replaying stale stream state.
The server, throughput, bitrate, remaining duration and available heap determine
the actual amount loaded ahead. The previous SABR recovery fixes remain intact.

## Verification and release

- Fourteen maintenance/Java-fixture checks cover subject versus channel,
  wrong-topic camera-model matches, water-filter subjects, Swedish accents,
  duplicate/current/unplayable videos, generic titles, stale callbacks,
  Swedish/English/Thai news, and memory-cap calculations.
- Seven Android/Robolectric checks exercise actual live/VOD loading decisions,
  byte limits, startup/rebuffer behavior, allocator cleanup on four lifecycle
  paths, and news JSON locale overrides starting from a Thai context.
- Two Android/Robolectric checks exercise actual Rumble JSON filtering and
  preservation of accepted playback metadata, including empty news.
- The six SABR attestation tests and signed mobile/TV build gates remain in CI.

Mobile v20 uses Android code 2473; TV v13 uses code 3013. Releases use the existing
permanent signing key and update channels. Previous release assets and the
manual higher-version recovery workflow remain available. Source pins, sync
backend and its SQLite database are unchanged. Actual phone/Google TV playback,
recommendation quality, live news content and memory pressure on those devices
remain to be confirmed; automated tests and builds are not device verification.
