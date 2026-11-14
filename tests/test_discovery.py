import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from test_playback_regressions import method

SOURCE = os.environ.get("SMARTTUBE_SOURCE_DIR")


@unittest.skipUnless(SOURCE, "Set SMARTTUBE_SOURCE_DIR to the patched checkout")
class DiscoveryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix="smarttube-discovery-")
        cls.root = Path(cls.directory.name)
        jdk = os.environ.get("JAVA_HOME")
        cls.java = str(Path(jdk) / "bin/java") if jdk else shutil.which("java")
        javac = str(Path(jdk) / "bin/javac") if jdk else shutil.which("javac")
        video = cls.root / "Video.java"
        video.write_text('''package com.liskovsoft.smartyoutubetv2.common.app.models.data;
public class Video {
    public String videoId, title, author, channelId, playlistId, remotePlaylistId;
    public boolean isChapter, isUpcoming, isUnplayable, isRemote;
    public boolean hasPlaylist() { return playlistId != null; }
    public String getTitle() { return title; }
    public String getAuthor() { return author; }
}''')
        fixture = Path(__file__).parent / "java/DiscoveryFixture.java"
        app = Path(SOURCE) / "common/src/main/java/com/liskovsoft/smartyoutubetv2/common"
        media = Path(SOURCE) / "MediaServiceCore/youtubeapi/src/main/java/com/liskovsoft/youtubeapi"
        result = subprocess.run([javac, "-encoding", "UTF-8", "-d", str(cls.root), str(video), str(fixture),
                                 str(app / "misc/RelatedVideoRanker.java"),
                                 str(app / "exoplayer/other/TemporaryBufferPolicy.java"),
                                 str(media / "common/helpers/PreferredNewsPolicy.java")],
                                capture_output=True, text=True)
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def fixture(self, mode):
        result = subprocess.run([self.java, "-cp", str(self.root), "DiscoveryFixture", mode],
                                capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn("PASS", result.stdout)

    def test_subject_before_channel_and_noise(self):
        self.fixture("ranking")

    def test_swedish_or_english_breaking_not_thai(self):
        self.fixture("news")

    def test_memory_bounded_read_ahead_policy(self):
        self.fixture("buffer")

    def test_switching_video_clears_old_rows_and_rejects_late_callbacks(self):
        source = (Path(SOURCE) / "common/src/main/java/com/liskovsoft/smartyoutubetv2/"
                  "common/app/models/playback/controllers/SuggestionsController.java").read_text()
        production = method(source, "public void onNewVideo(Video video)") + "\n" + method(
            source, "private boolean isCurrentSuggestion(") + "\n" + method(source, "private boolean isPlaylistSuggestion(")
        code = '''import java.util.Objects;
import com.liskovsoft.smartyoutubetv2.common.app.models.data.Video;
public class SuggestionContextFixture {
    int mSuggestionGeneration, mRelatedAutoPages;
    String mSuggestionsVideoId;
    Video current;
    FakePlayer player = new FakePlayer();
    static class FakePlayer { int clears; void clearSuggestions() { clears++; } }
    static class Helpers { static boolean equals(Object a, Object b) { return Objects.equals(a,b); } }
    void disposeActions() {}
    FakePlayer getPlayer() { return player; }
    Video getVideo() { return current; }
''' + production + '''
    static void check(boolean ok) { if (!ok) throw new AssertionError(); }
    public static void main(String[] args) {
        SuggestionContextFixture f = new SuggestionContextFixture();
        Video a = new Video(); a.videoId="A";
        Video b = new Video(); b.videoId="B";
        f.current=a; f.onNewVideo(a); int old=f.mSuggestionGeneration;
        check(f.isCurrentSuggestion(old,"A")); check(f.player.clears==1);
        f.current=b; f.onNewVideo(b);
        check(!f.isCurrentSuggestion(old,"A")); check(f.player.clears==2);
        f.current=a; f.onNewVideo(a);
        check(!f.isCurrentSuggestion(old,"A"));
        check(f.isCurrentSuggestion(f.mSuggestionGeneration,"A"));
        f.player=null; check(!f.isCurrentSuggestion(f.mSuggestionGeneration,"A"));
        a.playlistId="PL-explicit";
        check(f.isPlaylistSuggestion(a,0)); check(!f.isPlaylistSuggestion(a,1));
        a.isRemote=true; a.remotePlaylistId="PL-cast";
        check(!f.isPlaylistSuggestion(a,0));
        System.out.println("PASS context");
    }
}'''
        path = self.root / "SuggestionContextFixture.java"
        path.write_text(code)
        jdk = os.environ.get("JAVA_HOME")
        javac = str(Path(jdk) / "bin/javac") if jdk else shutil.which("javac")
        result = subprocess.run([javac, "-cp", str(self.root), "-d", str(self.root), str(path)],
                                capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        result = subprocess.run([self.java, "-cp", str(self.root), "SuggestionContextFixture"],
                                capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
