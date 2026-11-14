package com.liskovsoft.smartyoutubetv2.tv.ui.playback;

import static org.junit.Assert.*;
import android.content.Context;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import androidx.leanback.media.PlayerAdapter;
import androidx.leanback.widget.*;
import com.liskovsoft.smartyoutubetv2.common.app.models.data.Video;
import com.liskovsoft.smartyoutubetv2.common.app.models.data.VideoGroup;
import com.liskovsoft.smartyoutubetv2.common.misc.RelatedVideoRanker;
import com.liskovsoft.smartyoutubetv2.tv.R;
import com.liskovsoft.smartyoutubetv2.tv.ui.playback.other.VideoPlayerGlue;
import java.lang.reflect.Field;
import java.util.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class TvPlayerSuggestionsTest {
    private static void set(Object object, String name, Object value) throws Exception {
        Field field = PlaybackFragment.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(object, value);
    }
    private static Object get(Object object, String name) throws Exception {
        Field field = PlaybackFragment.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(object);
    }
    private static Video video(String id, String title, String channel) {
        Video video = new Video(); video.videoId = id; video.title = title; video.channelId = channel;
        return video;
    }
    private PlaybackFragment fragment() throws Exception {
        PlaybackFragment fragment = new PlaybackFragment();
        set(fragment, "mVideoGroupAdapters", new HashMap<>());
        set(fragment, "mCardPresenter", new com.liskovsoft.smartyoutubetv2.tv.presenter.VideoCardPresenter());
        return fragment;
    }
    private static final class NavigationFragment extends PlaybackFragment {
        int selected = -1, retries;
        @Override public Context getContext() { return RuntimeEnvironment.getApplication(); }
        @Override public void showOverlay(boolean show) {}
        @Override protected void setPlayerRowIndex(int index) { selected = index; }
        @Override protected void retryRelatedVideos() { retries++; }
    }
    @Test public void relatedActionSkipsChaptersAndPlaylistAndRetryRespondsToSelection() throws Exception {
        NavigationFragment fragment = new NavigationFragment();
        set(fragment, "mVideoGroupAdapters", new HashMap<>());
        set(fragment, "mCardPresenter", new com.liskovsoft.smartyoutubetv2.tv.presenter.VideoCardPresenter());
        ArrayObjectAdapter rows = new ArrayObjectAdapter(); rows.add(new Object());
        set(fragment, "mRowsAdapter", rows);
        VideoGroup playlist = VideoGroup.from(Collections.singletonList(video("playlist", "Playlist item", "a")));
        playlist.setId(11);
        fragment.updateSuggestions(playlist);
        VideoGroup related = VideoGroup.from(Collections.singletonList(video("subject", "Heat pump repair", "b")));
        related.setId(12);
        related.isRelatedSuggestions = true;
        fragment.updateSuggestions(related);
        fragment.showRelatedVideos();
        assertEquals(2, fragment.selected);
        assertEquals(0, fragment.retries);
        fragment.clearSuggestions();
        fragment.showRelatedVideos();
        assertEquals(1, fragment.selected);
        assertEquals(1, fragment.retries);
        ListRow status = (ListRow) rows.get(1);
        Class<?> listenerClass = Class.forName(PlaybackFragment.class.getName() + "$ItemViewClickedListener");
        java.lang.reflect.Constructor<?> constructor = listenerClass.getDeclaredConstructor(PlaybackFragment.class);
        constructor.setAccessible(true);
        OnItemViewClickedListener listener = (OnItemViewClickedListener) constructor.newInstance(fragment);
        listener.onItemClicked(null, status.getAdapter().get(0), null, status);
        assertEquals(2, fragment.retries);
    }
    @Test public void earlyResultsAreRetainedAndClearCancelsStaleRows() throws Exception {
        PlaybackFragment fragment = fragment();
        VideoGroup group = VideoGroup.from(Collections.singletonList(video("related", "Heat pump repair", "b")));
        group.isRelatedSuggestions = true;
        fragment.updateSuggestions(group);
        List<?> pending = (List<?>) get(fragment, "mPendingSuggestions");
        assertEquals(1, pending.size());
        fragment.clearSuggestions();
        assertEquals(0, pending.size());
        ArrayObjectAdapter rows = new ArrayObjectAdapter();
        rows.add(new Object()); // transport row remains first
        set(fragment, "mRowsAdapter", rows);
        fragment.updateSuggestions(group);
        assertEquals(2, rows.size());
        assertSame(group.get(0), ((ListRow) rows.get(1)).getAdapter().get(0));
    }
    @Test public void statusCardIsFocusableAndReplacedByPlayableRelatedRow() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        PlaybackFragment.RelatedStatusPresenter presenter = new PlaybackFragment.RelatedStatusPresenter();
        Presenter.ViewHolder holder = presenter.onCreateViewHolder(new FrameLayout(context));
        presenter.onBindViewHolder(holder, "Related videos unavailable. Select to retry.");
        assertTrue(holder.view.isFocusable());
        assertTrue(((Button) holder.view).getText().toString().contains("retry"));
        PlaybackFragment fragment = fragment();
        ArrayObjectAdapter rows = new ArrayObjectAdapter(); rows.add(new Object());
        set(fragment, "mRowsAdapter", rows);
        ArrayObjectAdapter status = new ArrayObjectAdapter(presenter); status.add("retry");
        ListRow statusRow = new ListRow(new HeaderItem("Related videos"), status);
        rows.add(statusRow); set(fragment, "mRelatedStatusRow", statusRow);
        VideoGroup group = VideoGroup.from(Collections.singletonList(video("candidate", "Volvo battery repair", "b")));
        group.isRelatedSuggestions = true;
        fragment.updateSuggestions(group);
        assertEquals(2, rows.size());
        assertFalse(rows.get(1) == statusRow);
        assertNull(get(fragment, "mRelatedStatusRow"));
    }
    private static final class Glue extends VideoPlayerGlue {
        Glue(Context context) { super(context, new PlayerAdapter() {
            @Override public void play() {}
            @Override public void pause() {}
        }, null); }
        void primary(ArrayObjectAdapter actions) { onCreatePrimaryActions(actions); }
    }
    @Test public void visibleTransportActionOpensRelatedWithoutDispatchingPlayback() {
        Glue glue = new Glue(RuntimeEnvironment.getApplication());
        ArrayObjectAdapter actions = new ArrayObjectAdapter();
        glue.primary(actions);
        Action related = null;
        for (int i = 0; i < actions.size(); i++) {
            Action action = (Action) actions.get(i);
            if (action.getId() == R.id.action_related_videos) related = action;
        }
        assertNotNull(related);
        assertEquals("Related videos", related.getLabel1());
        int[] calls = {0};
        glue.setRelatedVideosHandler(() -> calls[0]++);
        glue.onActionClicked(related);
        assertEquals(1, calls[0]);
    }
    @Test public void variedTitlesKeepSubjectMatchesButRejectSameChannelRandomVideo() {
        Video current = video("current", "Sony A7 IV autofocus settings for wildlife photography", "same");
        Video strong = video("strong", "Sony A7 IV autofocus wildlife photography settings", "other");
        Video varied = video("varied", "Sony A7 IV autofocus tips", "other");
        Video random = video("random", "Making pizza for dinner", "same");
        Video wrongTask = video("wrong-task", "Sony A7 IV battery replacement", "same");
        List<Video> result = RelatedVideoRanker.rankForPlayback(current, Arrays.asList(random, wrongTask, varied, strong, varied, current));
        assertEquals(Arrays.asList(strong, varied), result);
        assertEquals(0, RelatedVideoRanker.score(current, varied));
        assertTrue(RelatedVideoRanker.playbackScore(current, varied) > 0);
        Video water = video("water", "How to replace a household water filter cartridge", "a");
        Video cartridge = video("cartridge", "Water filter cartridge replacement", "b");
        assertEquals(Collections.singletonList(cartridge), RelatedVideoRanker.rankForPlayback(water,
                Arrays.asList(video("random2", "Stock market update", "a"), cartridge)));
    }
}
