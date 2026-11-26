"""Exercise the production focus logic with a deterministic UI scheduler."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from test_playback_regressions import method


@unittest.skipUnless(os.environ.get("SMARTTUBE_SOURCE_DIR"), "Set SMARTTUBE_SOURCE_DIR")
class TvHomeFocusTest(unittest.TestCase):
    def test_playback_return_focus_and_refresh(self):
        root = Path(os.environ["SMARTTUBE_SOURCE_DIR"])
        fragment = next(root.glob("smarttubetv/src/main/java/**/HomeGridFragment.java"))
        source = fragment.read_text()
        code = "\n".join(method(source, declaration) for declaration in (
            "private void rememberPlaybackTile(",
            "private void clearPlaybackAnchor(",
            "private static int categoryId(",
            "private int findPlaybackTile(",
            "private boolean canRestorePlaybackFocus(",
            "private void restorePlaybackFocus(",
            "private static final class PlaybackAnchor ",
        ))
        # These integration assertions keep the extracted logic tied to the TV
        # card click, lifecycle, async feed re-render and D-pad navigation.
        self.assertIn("rememberPlaybackTile(tile);", source.split("holder.itemView.setOnClickListener(v -> {")[-1])
        self.assertIn("mReturningFromPlayback = true", method(source, "public void onPause()"))
        self.assertIn("restorePlaybackFocus()", method(source, "public void onResume()"))
        self.assertIn("restorePlaybackFocus()", method(source, "private void render("))
        self.assertIn("clearPlaybackAnchor()", method(source, "public boolean dispatchKeyEvent("))
        fixture = (Path(__file__).parent / "java/TvHomeFocusFixture.java").read_text()
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "TvHomeFocusFixture.java"
            file.write_text(fixture.replace("/* PRODUCTION METHODS */", code))
            result = subprocess.run([shutil.which("java"), str(file)],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
