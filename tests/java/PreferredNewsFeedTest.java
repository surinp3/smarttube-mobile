package com.liskovsoft.smartyoutubetv2.common.exoplayer.other;

import static org.junit.Assert.*;
import com.liskovsoft.mediaserviceinterfaces.data.MediaGroup;
import com.liskovsoft.mediaserviceinterfaces.data.MediaItem;
import com.liskovsoft.youtubeapi.common.helpers.PreferredNewsFeed;
import com.liskovsoft.youtubeapi.service.data.YouTubeMediaGroup;
import com.liskovsoft.youtubeapi.service.data.YouTubeMediaItem;
import java.util.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, manifest = Config.NONE)
public class PreferredNewsFeedTest {
    private static final long NOW = 1_794_646_800_000L;
    private static YouTubeMediaItem item(String id, String title, String author, long time) {
        YouTubeMediaItem result = new YouTubeMediaItem();
        result.setVideoId(id); result.setTitle(title); result.setAuthor(author); result.setPublishedDate(time);
        return result;
    }
    private static List<MediaGroup> group(MediaItem... items) {
        YouTubeMediaGroup row = new YouTubeMediaGroup(MediaGroup.TYPE_NEWS);
        row.setMediaItems(Arrays.asList(items));
        return Collections.singletonList(row);
    }
    @Test public void singleSwedishResultStillFillsSwedishAndEnglishSelections() {
        List<String> calls = new ArrayList<>();
        List<MediaGroup> rows = PreferredNewsFeed.load((query, english) -> {
            calls.add(query);
            List<MediaItem> items = new ArrayList<>();
            String author = english ? query.startsWith("BBC") ? "BBC News" : query.startsWith("Sky") ? "Sky News" : "Reuters" :
                    query.startsWith("SVT") ? "SVT Nyheter" : query.startsWith("TV4") ? "TV4 Nyheterna" : query.startsWith("Aftonbladet") ? "Aftonbladet" : "Expressen";
            int count = query.startsWith("SVT") ? 1 : 12;
            for (int i=0;i<count;i++) items.add(item(query+i,
                    english ? "Storm closes roads as emergency crews respond " + i : "Kraftigt snöfall stänger vägar i norr " + i,
                    author, NOW-i*60_000));
            YouTubeMediaGroup row = new YouTubeMediaGroup(MediaGroup.TYPE_NEWS); row.setMediaItems(items);
            return Collections.singletonList(row);
        }, NOW);
        assertEquals(2, rows.size());
        assertEquals(24, rows.get(0).getMediaItems().size());
        assertEquals(24, rows.get(1).getMediaItems().size());
        assertTrue(calls.stream().anyMatch(q -> q.startsWith("BBC")));
        Set<String> ids = new HashSet<>();
        for (MediaGroup row : rows) {
            assertNull(row.getNextPageKey());
            Map<String,Integer> publishers = new HashMap<>();
            for (MediaItem item : row.getMediaItems()) {
                assertTrue(ids.add(item.getVideoId()));
                publishers.put(item.getAuthor(), publishers.getOrDefault(item.getAuthor(),0)+1);
            }
            for (int count : publishers.values()) assertTrue(count<=8);
        }
    }
    @Test public void failureOrEmptySwedishSourcesDoNotPreventEnglishNews() {
        List<MediaGroup> result = PreferredNewsFeed.load((query, english) -> {
            if (!english) throw new IllegalStateException("Unavailable");
            return group(item("bbc", "Flood alerts after heavy rain", "BBC News", NOW));
        }, NOW);
        assertEquals(1,result.size());
        assertEquals("Breaking news in English",result.get(0).getTitle());
        assertEquals(1,result.get(0).getMediaItems().size());
    }
    @Test public void rejectsStaleThaiDuplicatesAndRandomVideosRatherThanPadding() {
        List<MediaGroup> result = PreferredNewsFeed.load((query, english) -> group(
                item("fresh",english ? "Flooding after heavy rain" : "Regnet stänger vägar",english ? "BBC News" : "SVT Nyheter",NOW),
                item("old","Breaking news after the election","BBC News",NOW-7*24*60*60*1000L),
                item("thai","ข่าวด่วน น้ำท่วม","BBC News",NOW),
                item("random","Pasta carbonara recipe","Cooking channel",NOW),
                item("fresh","Same clip","SVT Nyheter",NOW)),NOW);
        int count=0; for(MediaGroup row:result) count+=row.getMediaItems().size();
        assertEquals(1,count);
    }
    @Test public void allUnavailableReturnsEmptyWithoutChangingGlobalLocale() {
        final int[] calls={0};
        assertTrue(PreferredNewsFeed.load((query,english)->{calls[0]++;return null;},NOW).isEmpty());
        assertEquals(9,calls[0]);
    }
    @Test public void currentSwedishBusinessPublishersAreIncludedBeforeEnglish() {
        List<MediaGroup> rows=PreferredNewsFeed.load((query,english)-> {
            if(query.startsWith("EFN"))return group(item("efn-live","Chefsekonomens prognos efter börsoron","EFN Ekonomikanalen • 3000 visningar • för 1 dag sedan",-1));
            if(query.startsWith("Dagens industri"))return group(item("di-live","AI och ekonomin: dagens analys","Dagens industri • 12000 visningar • för 21 timmar sedan",-1));
            if(english)return group(item("bbc-live","Flight activity after emergency shutdown","BBC News • 65000 views • 1 hour ago",-1));
            return Collections.emptyList();
        },NOW);
        assertEquals(2,rows.size());
        assertEquals("Swedish news",rows.get(0).getTitle());
        assertEquals(2,rows.get(0).getMediaItems().size());
        assertEquals("Breaking news in English",rows.get(1).getTitle());
        assertEquals(1,rows.get(1).getMediaItems().size());
    }
    @Test public void recentSwedenHistoryAndSatireDoNotQualifyAsSwedishNews() {
        assertTrue(PreferredNewsFeed.load((query,english)->group(
                item("history","Why Hitler never invaded Sweden","INKTROOPS • 14 visningar • för 2 timmar sedan",-1),
                item("satire","Svenska nyheter","SVT Humor • 4000 visningar • för 7 timmar sedan",-1),
                item("archive","Disney nyheter SVT 1996","TV-Minnen Sverige • 2 visningar • för 3 timmar sedan",-1)),NOW).isEmpty());
    }
    @Test public void supportedDateFilterActuallyProducesParameters() throws Exception {
        Class<?> helper=Class.forName("com.liskovsoft.youtubeapi.search.SearchFilterHelper");
        java.lang.reflect.Method method=helper.getDeclaredMethod("toParams",int.class); method.setAccessible(true);
        assertEquals("EgQIAhAB",method.invoke(null,PreferredNewsFeed.SEARCH_OPTIONS));
    }
    @Test public void realTvMetadataRejectsYearsOldClipsAndCountsPublisherInsteadOfViewText() {
        List<MediaGroup> rows=PreferredNewsFeed.load((query,english)->{
            if(english)return Collections.emptyList();
            List<MediaItem> items=new ArrayList<>();
            items.add(item("old-sw","Nyheterna 19.00","TV4 Nyheterna • 25 432 visningar • för 8 år sedan",-1));
            items.add(item("old-en","Breaking news after the vote","BBC News • 34K views • 12 days ago",-1));
            for(int i=0;i<15;i++) items.add(item("fresh-meta-"+i,english ? "Storm emergency" : "Kraftigt snöfall",
                    (english ? "BBC News • 34K views • " : "SVT • 12 000 visningar • för ")+ (i+1) + (english ? " hours ago" : " timmar sedan"),-1));
            YouTubeMediaGroup row=new YouTubeMediaGroup(MediaGroup.TYPE_NEWS);row.setMediaItems(items);return Collections.singletonList(row);
        },NOW);
        assertEquals(1,rows.size()); // shared IDs deduplicate across the language sources
        assertEquals(8,rows.get(0).getMediaItems().size());
        for(MediaItem item:rows.get(0).getMediaItems())assertTrue(item.getVideoId().startsWith("fresh-meta-"));
    }
}
