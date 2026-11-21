"""Desktop identity guards; technical format names and service credits are not UI branding."""
import json
from pathlib import Path

from PIL import Image
import unittest

ROOT = Path(__file__).resolve().parents[2]
CRATE = ROOT / 'src/crates/concat'


class DesktopIdentity(unittest.TestCase):
    def test_home_does_not_advertise_upstream_community(self):
        home = (CRATE / 'ui/start.slint').read_text()
        routes = (CRATE / 'src/panes/start.rs').read_text()
        for token in ('discord', 'concat.standalones.org'):
            self.assertFalse(token in (home + routes).lower(), token)

    def test_window_icon_matches_windows_icon(self):
        icons = ROOT / 'assets/icons'
        with Image.open(icons / 'concat.ico') as ico, Image.open(icons / 'concat_logo_256.png') as png:
            self.assertEqual(ico.ico.getimage((256, 256)).convert('RGBA').tobytes(), png.convert('RGBA').tobytes())

    def test_locale_identity(self):
        # Keep accurate service names, the iOS permission path and env variable.
        exceptions = {'settings.concatsMirror', 'sounds.offline', 'export.photosNotAllowed'}
        for path in (CRATE / 'locales').glob('*.json'):
            strings = json.loads(path.read_text(encoding='utf-8'))
            for key, value in strings.items():
                if isinstance(value, str) and key not in exceptions:
                    self.assertFalse('concat' in value.replace('CONCAT_LOG', '').lower(), (path.stem, key))
            self.assertEqual(strings['settings.concat'], 'DaProd Editor Video {0}', path.stem)

    def test_no_obsolete_ui_logo(self):
        self.assertFalse((CRATE / 'ui/assets/concat-logo.png').exists())
        for surface in ('title-bar.slint', 'dialogs/export.slint'):
            self.assertIn('assets/daprod-banco.svg', (CRATE / 'ui' / surface).read_text())


if __name__ == '__main__':
    unittest.main()
