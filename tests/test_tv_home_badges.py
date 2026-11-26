"""Verify source branding stays on the TV Home thumbnail, not dedicated feeds."""
import os
from pathlib import Path
import unittest
from xml.etree import ElementTree

from test_playback_regressions import method


@unittest.skipUnless(os.environ.get("SMARTTUBE_TV_SOURCE_DIR"), "Requires patched TV source")
class TvHomeBadgeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = Path(os.environ["SMARTTUBE_TV_SOURCE_DIR"]) / "smarttubetv/src/main"
        cls.tv = cls.source / "java/com/liskovsoft/smartyoutubetv2/tv"

    def test_home_is_the_only_presenter_opt_in(self):
        presenter = (self.tv / "presenter/VideoCardPresenter.java").read_text()
        home = (self.tv / "ui/browse/video/HomeGridFragment.java").read_text()
        factory = (self.tv / "ui/browse/BrowseSectionFragmentFactory.java").read_text()
        declaration = "protected boolean showsVideoSourceBadge()"
        self.assertIn("return false;", method(presenter, declaration))
        self.assertIn("return true;", method(home, declaration))
        self.assertEqual(
            {"VideoCardPresenter.java", "HomeGridFragment.java"},
            {p.name for p in self.tv.rglob("*.java") if declaration in p.read_text()},
        )
        self.assertIn("header.getId() == MediaGroup.TYPE_HOME", factory)
        self.assertIn("? new HomeGridFragment() : new VideoRowsFragment()", factory)
        self.assertEqual(1, factory.count("new HomeGridFragment()"))

    def test_video_cards_clear_hidden_badges_and_select_platform(self):
        presenter = (self.tv / "presenter/VideoCardPresenter.java").read_text()
        bind = method(presenter, "public void onBindViewHolder(")
        self.assertRegex(bind, r"if \(!showsVideoSourceBadge\(\) \|\| video\.videoId == null\) \{\s*cardView\.setVideoSourceBadge\(0, 0\);")
        self.assertRegex(bind, r"else if \(PatRumbleCards\.isRumble\(video\)\) \{\s*cardView\.setVideoSourceBadge\(R\.drawable\.pat_video_source_rumble, R\.string\.pat_video_source_rumble\);")
        self.assertRegex(bind, r"else \{\s*cardView\.setVideoSourceBadge\(R\.drawable\.pat_video_source_youtube, R\.string\.pat_video_source_youtube\);")

    def test_top_left_and_hidden_by_default(self):
        root = ElementTree.parse(self.source / "res/layout/text_badge_image_view.xml")
        android = "{http://schemas.android.com/apk/res/android}"
        badge = next(view for view in root.iter() if view.get(android + "id") == "@+id/pat_video_source_badge")
        self.assertEqual("true", badge.get(android + "layout_alignParentTop"))
        self.assertEqual("true", badge.get(android + "layout_alignParentLeft"))
        self.assertIsNone(badge.get(android + "layout_alignParentRight"))
        self.assertEqual("gone", badge.get(android + "visibility"))
