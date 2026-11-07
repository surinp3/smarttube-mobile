import json
from pathlib import Path
import unittest

from scripts.prepare_recovery import (
    patch_version_code, update_gradle, update_mobile_java,
    validate_release_numbers,
)
from scripts.retarget_tv_update import update_manifest


ROOT = Path(__file__).resolve().parent.parent
GRADLE_FIXTURE = '''android {
    productFlavors {
        stmobile {
            applicationId "app.smarttube.mobile"
            versionCode 2466
            versionNameSuffix "-mobile.13"
        }
        stpattv {
            applicationId "app.smarttube.pattv"
            versionCode 3002
            versionNameSuffix "-tv.2"
        }
    }
}
'''


class RecoveryTest(unittest.TestCase):
    def test_tv_rebuild_keeps_the_package_and_increments_code(self):
        updated = update_gradle(GRADLE_FIXTURE, "tv", 3003, 3)
        self.assertIn('applicationId "app.smarttube.pattv"', updated)
        self.assertIn('versionNameSuffix "-tv.recovery.3"', updated)
        self.assertIn("versionCode 3003", updated)

    def test_mobile_recovery_increments_displayed_release(self):
        updated = update_gradle(GRADLE_FIXTURE, "mobile", 2467, 14)
        self.assertIn('applicationId "app.smarttube.mobile"', updated)
        self.assertIn('versionNameSuffix "-mobile.recovery.14"', updated)
        self.assertIn("versionCode 2467", updated)
        self.assertEqual(
            update_mobile_java("private static final int MOBILE_VERSION = 13;", 14),
            "private static final int MOBILE_VERSION = 14;",
        )

    def test_cannot_overwrite_same_or_newer_version(self):
        with self.assertRaises(ValueError):
            update_gradle(GRADLE_FIXTURE, "tv", 3002, 3)
        with self.assertRaises(ValueError):
            validate_release_numbers("tv", "tv-v2", 2, ["tv-v2"])

    def test_current_patches_have_parseable_codes(self):
        self.assertEqual(patch_version_code((ROOT / "tv.patch").read_text()), 3002)
        self.assertEqual(patch_version_code((ROOT / "mobile.patch").read_text()), 2466)

    def test_tv_manifest_points_recovery_and_preserves_history(self):
        original = json.loads((ROOT / "tv_update.json").read_text())
        new = update_manifest(original, 3, 3003)
        self.assertIn("32.69-tv.recovery.3", new)
        self.assertIn("ARMv7.apk", new["package"]["downloadUrlList_armeabi-v7a"][0])
        self.assertIn("32.69-tv.2", new)


if __name__ == "__main__":
    unittest.main()
