# TV v14: related videos below the player

The player already supported Leanback suggestion rows. TV v13 could erase all
of them: strict title matching required two terms, high coverage and a match
in the title's final third. Empty rows were discarded, and updates arriving
before row initialization were lost. With no row, remote navigation had
nothing to select. These are demonstrated failure mechanisms; there are no
logs or visual capture from Pat's actual TV identifying its exact state.

TV v14 adds a **Related videos** action beside the main playback controls.
Select it with the remote to open the first related row below the player,
skipping chapters and explicit playlists. Normal Down navigation also remains
available. If results are loading, empty or unavailable, a focusable status
card provides a retry action. Retrying reloads suggestions, not the stream.
Explicit child-mode and disabled-suggestions settings remain respected.

Suggestions come from the playing video's WatchNext metadata, supplemented by
a search using that video's subject. They do not come from the Home feed.
Strong title matches rank first. Partial matches can survive different title
wording, with meaningful subject evidence still required. For long titles,
matching only the opening brand/model is insufficient. Channel only breaks
equal subject scores. Duplicate, current, upcoming and unplayable items are
excluded. Empty results remain visible as a retry state; unrelated Home
recommendations are not substituted. Title matching cannot guarantee semantic
relevance across translations or entirely different wording.

The TV-only `tv-player.patch` applies after `pat-sync.patch`. Mobile v20 and
the upstream pins remain unchanged. The TV recovery workflow applies this
overlay only when present in the chosen known-good TV source. Previous
release assets and manifest entries are retained. TV v14 uses package
`app.smarttube.pattv`, code 3014 and the existing production signing key.

Five Android/Robolectric tests exercise the actual player adapter, focusable
status presenter, transport action dispatch, selection of related rows after
playlists, retry selection, retained early updates, stale-row clearing and
subject ranking. The existing 14 maintenance/Java fixtures, buffer/news,
SABR and Rumble regression gates remain applicable.

No Android device is connected. Emulator acceleration reports that the
Android Emulator hypervisor driver is not installed. Automated UI tests do
not establish how the screen looks on Pat's TV or verify real playback.

Release verification results are recorded after the signed build and public
download checks complete.
