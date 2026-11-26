import java.util.*;

public class TvHomeFocusFixture {
    private final RecyclerView mGrid = new RecyclerView();
    private final Adapter mAdapter = new Adapter();
    private PlaybackAnchor mPlaybackAnchor;
    private boolean mReturningFromPlayback, mFocusFirstRecent, resumed;
    private int mFocusRequest, mPendingPosition;
    private final BrowseSupportFragment parent = new BrowseSupportFragment();

    boolean isResumed() { return resumed; }
    Object getParentFragment() { return parent; }

    static class Video {
        final String videoId;
        Video(String id) { videoId = id; }
    }

    static class VideoGroupObjectAdapter {
        final int id;
        VideoGroupObjectAdapter(int category) { id = category; }
        List<VideoGroupObjectAdapter> getAllGroups() { return Collections.singletonList(this); }
        int getId() { return id; }
    }

    static class Tile {
        final VideoGroupObjectAdapter category;
        final Video video;
        Tile(int category, Video video) {
            this.category = new VideoGroupObjectAdapter(category);
            this.video = video;
        }
    }

    static class Adapter { List<Tile> tiles = new ArrayList<>(); }
    static class BrowseSupportFragment {
        boolean showing;
        boolean isShowingHeaders() { return showing; }
    }

    static class RecyclerView {
        static final int NO_POSITION = -1;
        boolean window;
        int focused = 0, scrolled = 0;
        final Queue<Runnable> posted = new ArrayDeque<>(), preDraw = new ArrayDeque<>();
        boolean hasWindowFocus() { return window; }
        void post(Runnable task) { posted.add(task); }
        void stopScroll() { }
        void scrollToPosition(int position) { scrolled = position; }
        ViewHolder findViewHolderForAdapterPosition(int position) {
            return position == scrolled ? new ViewHolder(position) : null;
        }
        void runPosts() { while (!posted.isEmpty()) posted.remove().run(); }
        void draw() { while (!preDraw.isEmpty()) preDraw.remove().run(); }
        class ViewHolder {
            final Item itemView;
            ViewHolder(int position) { itemView = new Item(position); }
        }
        class Item {
            final int position;
            Item(int position) { this.position = position; }
            boolean hasFocus() { return focused == position; }
            void requestFocus() { focused = position; }
        }
    }

    static class OneShotPreDrawListener {
        static void add(RecyclerView grid, Runnable task) { grid.preDraw.add(task); }
    }

    /* PRODUCTION METHODS */

    static void check(boolean ok, String reason) {
        if (!ok) throw new AssertionError(reason);
    }

    void refresh(Tile... tiles) {
        mAdapter.tiles = Arrays.asList(tiles);
        restorePlaybackFocus();
        mGrid.runPosts();
    }

    void assertFocused(int position, String reason) {
        mGrid.draw();
        check(mGrid.focused == position, reason);
    }

    void exercise(String id) {
        Tile above = new Tile(1, new Video("above"));
        Tile watched = new Tile(1, new Video(id));
        Tile duplicate = new Tile(2, new Video(id));
        mFocusFirstRecent = true;
        rememberPlaybackTile(watched);
        check(!mFocusFirstRecent && mPendingPosition == -1, "cancel startup/index focus");

        resumed = false;
        mReturningFromPlayback = true;
        refresh(above, duplicate, watched);
        assertFocused(0, "do not focus while player is visible");

        resumed = true;
        refresh(above, duplicate, watched);
        assertFocused(0, "wait until browse window actually has focus");

        mGrid.window = true;
        refresh(above, duplicate, watched);
        check(mGrid.scrolled == 2 && mGrid.focused == 0, "wait for layout after scrolling");
        assertFocused(2, "restore exact clicked card, not an earlier duplicate");

        // Recent uploads arrive in more than one async callback.
        refresh(above, duplicate);
        assertFocused(2, "do not move to a different category while originals reload");
        Tile rebuilt = new Tile(1, new Video(id));
        refresh(above, new Tile(1, new Video("new")), duplicate, rebuilt);
        assertFocused(3, "re-find the original category and stable ID at a new index");

        refresh(above, rebuilt, duplicate); // obsolete pending pre-draw
        refresh(above, duplicate, new Tile(1, null), new Tile(1, new Video("extra")), rebuilt);
        assertFocused(4, "invalidate stale requests if another feed update wins");

        parent.showing = true;
        refresh(rebuilt, above, duplicate);
        assertFocused(4, "do not steal focus from the sidebar");
        parent.showing = false;

        refresh(above, rebuilt, duplicate);
        clearPlaybackAnchor(); // user pressed a navigation key before layout
        assertFocused(4, "cancel pending focus when the viewer navigates");
    }

    public static void main(String[] args) {
        new TvHomeFocusFixture().exercise("youtubeVideo123");
        new TvHomeFocusFixture().exercise("pat-rumble:1234");
    }
}
