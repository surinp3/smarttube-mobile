"""Execute production playback control methods with network-free Java fixtures.

Set SMARTTUBE_SOURCE_DIR to the patched SmartTube checkout. Android/protobuf
integration is covered separately by SabrProtectionStatusTest in mobile.patch.
"""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = os.environ.get("SMARTTUBE_SOURCE_DIR")


def method(source, declaration):
    start = source.index(declaration)
    opening = source.index("{", start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end].replace("@Override", "")


@unittest.skipUnless(SOURCE, "Set SMARTTUBE_SOURCE_DIR to a patched source checkout")
class PlaybackRegressionTests(unittest.TestCase):
    def run_java(self, body):
        java_home = os.environ.get("JAVA_HOME")
        javac = str(Path(java_home) / "bin" / "javac") if java_home else shutil.which("javac")
        java = str(Path(java_home) / "bin" / "java") if java_home else shutil.which("java")
        with tempfile.TemporaryDirectory(prefix="smarttube-playback-") as directory:
            path = Path(directory) / "PlaybackFixture.java"
            path.write_text("import java.util.*;\npublic class PlaybackFixture {\n" + body + "\n}")
            compiled = subprocess.run([javac, "-d", directory, str(path)], capture_output=True, text=True)
            self.assertEqual(0, compiled.returncode, compiled.stdout + compiled.stderr)
            result = subprocess.run([java, "-cp", directory, "PlaybackFixture"],
                                    capture_output=True, text=True)
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            self.assertIn("PASS", result.stdout)

    def test_each_client_attempt_uses_a_fresh_nonce(self):
        source = (Path(SOURCE) / "MediaServiceCore/youtubeapi/src/main/java/com/liskovsoft/"
                  "youtubeapi/videoinfo/V2/VideoInfoService.java").read_text()
        production = "\n".join(method(source, declaration) for declaration in [
            "public VideoInfo getVideoInfo(String videoId, String clickTrackingParams)",
            "private VideoInfo firstPlayable(", "private interface InfoTester",
            "private VideoInfo firstInfoWith(",
        ])
        self.run_java(production + r'''
    static final String TAG = "fixture";
    enum AppClient { A, B, C }
    static final AppClient[] CLIENT_LIST = AppClient.values();
    boolean mUseAuth, mIsUnplayable;
    int mode;
    List<Integer> nonces = new ArrayList<>();
    static class AppService {
        static final AppService SINGLETON = new AppService();
        int nonce;
        static AppService instance() { return SINGLETON; }
        void resetClientPlaybackNonce() { nonce++; }
    }
    static class Helpers {
        static AppClient getNextValue(AppClient[] clients, AppClient client) {
            return clients[(client.ordinal() + 1) % clients.length];
        }
    }
    static class Log { static void e(String tag, String text, Object... args) {} }
    static class VideoInfo {
        boolean unplayable, regular;
        VideoInfo(boolean unplayable, boolean regular) {
            this.unplayable = unplayable; this.regular = regular;
        }
        boolean isUnplayable() { return unplayable; }
        Object getRegularFormats() { return regular ? this : null; }
    }
    AppClient getClient() { return AppClient.A; }
    VideoInfo getVideoInfoWithRentFix(AppClient client, String id, String tracking) {
        nonces.add(AppService.instance().nonce);
        if (mode == 1) return new VideoInfo(true, nonces.size() == 6);
        if (mode == 2) return new VideoInfo(false, true);
        return client == AppClient.A ? null : new VideoInfo(client == AppClient.B, false);
    }
    void applyFixesIfNeeded(VideoInfo info, String id, String tracking) {}
    void transformFormats(VideoInfo info) {}
    void persistRecentTypeIfNeeded(VideoInfo info) {}
    void check(boolean condition) { if (!condition) throw new AssertionError(nonces); }
    void assertFresh(int count) {
        check(nonces.size() == count);
        check(new HashSet<>(nonces).size() == count);
        check(nonces.get(0) > 0);
    }
    public static void main(String[] args) {
        PlaybackFixture fixture = new PlaybackFixture();
        fixture.check(fixture.getVideoInfo(null, null) == null);
        fixture.check(fixture.nonces.isEmpty());
        fixture.check(fixture.getVideoInfo("video", null) != null);
        fixture.assertFresh(3);
        fixture = new PlaybackFixture(); fixture.mode = 1;
        fixture.check(fixture.getVideoInfo("video", null) != null);
        fixture.assertFresh(6);
        fixture = new PlaybackFixture(); fixture.mode = 2;
        fixture.getVideoInfo("first", null); fixture.getVideoInfo("second", null);
        fixture.assertFresh(2);
        System.out.println("PASS: nonce isolation across clients, passes, and video loads");
    }
''')

    def test_sabr_reload_and_backoff_retry_once_then_fall_back(self):
        source = (Path(SOURCE) / "common/src/main/java/com/liskovsoft/smartyoutubetv2/"
                  "common/app/models/playback/controllers/ErrorFixerController.java").read_text()
        constant = next(line.strip() for line in source.splitlines()
                        if "private static final int MAX_SABR_ERROR_FIX_ATTEMPTS" in line)
        production = "\n".join(method(source, declaration) for declaration in [
            "private boolean applySabrReloadPlayerAction(",
            "private boolean applySabrBackoffAction(", "public void onPlay()",
        ])
        self.run_java(constant + "\n" + production + r'''
    String mSabrErrorFixVideoId;
    int mSabrErrorFixAttempts;
    Video video = new Video();
    VideoLoaderController mVideoLoaderController = new VideoLoaderController();
    BufferingDetector mBufferingDetector = new BufferingDetector();
    static class Video { String videoId = "first"; }
    static class BufferingDetector { void onStopBuffering() {} }
    static class VideoLoaderController { int reloads; void reloadVideo() { reloads++; } }
    static class SabrReloadPlayerError extends RuntimeException {
        String reloadPlaybackToken = "server-token";
    }
    static class SabrBackoffError extends RuntimeException {}
    static class Helpers { static boolean equals(Object a, Object b) { return Objects.equals(a, b); } }
    static class MessageHelpers { static void showLongMessage(Object context, String text, Object... args) {} }
    static class YouTubeServiceManager {
        static final YouTubeServiceManager SINGLETON = new YouTubeServiceManager();
        int tokenReloads;
        static YouTubeServiceManager instance() { return SINGLETON; }
        void reloadPlayerResponse(String id, String token) {
            if (!"server-token".equals(token)) throw new AssertionError(token);
            tokenReloads++;
        }
    }
    Object getContext() { return null; }
    Video getVideo() { return video; }
    static void check(boolean condition) { if (!condition) throw new AssertionError(); }
    public static void main(String[] args) {
        PlaybackFixture fixture = new PlaybackFixture();
        Throwable reload = new RuntimeException(new SabrReloadPlayerError());
        check(fixture.applySabrReloadPlayerAction(reload));
        check(!fixture.applySabrReloadPlayerAction(reload));
        check(fixture.mVideoLoaderController.reloads == 1);
        check(YouTubeServiceManager.instance().tokenReloads == 1);
        fixture.onPlay(); check(fixture.applySabrReloadPlayerAction(reload));
        fixture.video.videoId = "second";
        check(fixture.applySabrReloadPlayerAction(reload));
        check(!fixture.applySabrReloadPlayerAction(reload));
        fixture = new PlaybackFixture();
        Throwable backoff = new RuntimeException(new SabrBackoffError());
        check(fixture.applySabrBackoffAction(backoff));
        check(!fixture.applySabrBackoffAction(backoff));
        check(fixture.mVideoLoaderController.reloads == 1);
        check(!fixture.applySabrReloadPlayerAction(new RuntimeException()));
        System.out.println("PASS: bounded SABR retries, reload token, video/play resets");
    }
''')
