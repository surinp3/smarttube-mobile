import com.liskovsoft.smartyoutubetv2.common.app.models.data.Video;
import com.liskovsoft.smartyoutubetv2.common.misc.RelatedVideoRanker;
import com.liskovsoft.smartyoutubetv2.common.exoplayer.other.TemporaryBufferPolicy;
import com.liskovsoft.youtubeapi.common.helpers.PreferredNewsPolicy;
import java.util.*;

public final class DiscoveryFixture {
    static Video video(String id, String title, String channel) {
        Video v = new Video(); v.videoId = id; v.title = title; v.channelId = channel;
        v.author = channel; return v;
    }
    static void check(boolean value, String reason) { if (!value) throw new AssertionError(reason); }
    static boolean news(String title, String author, String row, boolean english) {
        return PreferredNewsPolicy.accepts(title, author, row, english);
    }
    public static void main(String[] args) {
        if (args[0].equals("ranking")) {
            Video current = video("current", "Reverse osmosis water filter membrane replacement", "Water Lab");
            Video close = video("close", "Reverse osmosis water filter membrane replacement guide", "Other creator");
            Video own = video("own", "Reverse osmosis water filter membrane", "Water Lab");
            Video random = video("random", "Why I bought a sports car", "Water Lab");
            Video weak = video("weak", "Water prices rise after the election", "Other creator");
            List<Video> ranked = RelatedVideoRanker.rank(current, Arrays.asList(random, own, weak, close, close, current, null));
            check(ranked.size() == 2, "Unrelated, weak, duplicate and current videos must be removed");
            check(ranked.get(0) == close, "A stronger subject match must beat the current channel");
            Video sameSubject = video("same", close.title, "Water Lab");
            ranked = RelatedVideoRanker.rank(current, Arrays.asList(close, sameSubject));
            check(ranked.get(0) == sameSubject, "Channel only breaks a subject-score tie");
            Video invalid = video("invalid", close.title, "Other"); invalid.isUpcoming = true;
            check(RelatedVideoRanker.rank(current, Arrays.asList(invalid)).isEmpty(), "Upcoming is not a recommendation");
            Video swedish = video("sv", "Vattenfilter i köket: montering och byte", "Teknikkanalen");
            check(RelatedVideoRanker.score(swedish, video("s2", "Montering och byte av vattenfilter i koket", "Annan kanal")) > 0,
                    "Case and diacritics must not hide a Swedish subject match");
            check(RelatedVideoRanker.subjectQuery(video("empty", "Official video latest update", "Creator")) == null,
                    "Generic titles must not produce a broad unrelated search");
            check(!RelatedVideoRanker.subjectQuery(current).contains("lab"), "Do not use channel as search subject");
            Video camera = video("camera", "Sony A7 IV autofocus setup", "Camera channel");
            check(RelatedVideoRanker.score(camera, video("focus", "Sony A7 IV autofocus settings", "Other creator")) > 0,
                    "Specific camera task matches");
            check(RelatedVideoRanker.score(camera, video("battery", "Sony A7 IV battery review", "Camera channel")) == 0,
                    "Brand/model and channel alone must not override a different subject");
            Locale.setDefault(new Locale("tr", "TR"));
            check(RelatedVideoRanker.score(current, close) > RelatedVideoRanker.score(current, own), "Device locale must not alter rank");
        } else if (args[0].equals("news")) {
            Locale.setDefault(new Locale("th", "TH"));
            check(news("Regeringen presenterar budgeten", "SVT Nyheter", "Senaste nytt", false), "Swedish outlet");
            check(news("Sweden parliament votes on new housing rules", "BBC News", "Top stories", false), "News about Sweden");
            check(news("Polisen utreder branden", "TV4 Nyheterna", "Nyheter", false), "TV4 Swedish news");
            check(!news("ข่าวด่วนจากกรุงเทพ", "SVT Nyheter", "Nyheter", false), "Thai title must be excluded");
            check(news("President resigns after emergency meeting", "BBC News", "Breaking news", true), "English breaking row");
            check(!news("President resigns after emergency meeting", "BBC News", "Top stories", true), "Not a generic English-news fallback");
            check(news("BREAKING: Flooding after powerful storm", "Local reporter", "", true), "English breaking headline");
            check(!news("BREAKING ข่าวด่วน", "BBC News", "Breaking news", true), "Mixed Thai title");
            check(!news("BREAKING: Срочные новости", "BBC News", "Breaking news", true), "Not English script");
            check(!news("Ultima hora tormenta llega", "Noticias", "Breaking news", true), "Do not assume Latin means English");
            check(!news("Cooking the perfect pasta", "Cooking channel", "", true), "Unrelated fallback");
            check(!news(null, "SVT Nyheter", "Nyheter", false), "Missing title fails closed");
            check(PreferredNewsPolicy.SWEDISH_LANGUAGE.equals("sv") && PreferredNewsPolicy.SWEDISH_COUNTRY.equals("SE"), "Sweden request locale");
            check(PreferredNewsPolicy.ENGLISH_LANGUAGE.equals("en") && PreferredNewsPolicy.ENGLISH_COUNTRY.equals("GB"), "English fallback request locale");
        } else if (args[0].equals("buffer")) {
            long gb = 1_000_000_000L;
            check(TemporaryBufferPolicy.budget(4*gb, 0, 0, gb) == 500_000_000, "500 MB on a capable heap");
            check(TemporaryBufferPolicy.budget(256_000_000, 0, 0, gb) == 64_000_000, "Small heap scales down");
            check(TemporaryBufferPolicy.budget(512_000_000, 500_000_000, 0, gb) == 4_000_000, "Heap pressure scales down");
            check(TemporaryBufferPolicy.budget(4*gb, 0, 0, 25_000_000) == 25_000_000, "Physical device cap wins");
            check(TemporaryBufferPolicy.budget(0, 0, 0, 0) == 65_536, "Invalid memory data has a tiny safe floor");
            check(TemporaryBufferPolicy.VOD_MAX_MS == 600_000 && TemporaryBufferPolicy.LIVE_MAX_US == 30_000_000,
                    "VOD and live horizons remain bounded");
        } else throw new AssertionError(args[0]);
        System.out.println("PASS " + args[0]);
    }
}
