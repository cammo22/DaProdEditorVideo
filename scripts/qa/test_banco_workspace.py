#!/usr/bin/env python3
"""Render the Banco workspace with Slint Viewer and test its desk chrome."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from PIL import Image

UI = Path(__file__).resolve().parents[2] / "src/crates/concat/ui"
VIEWER = os.environ.get("SLINT_VIEWER", "slint-viewer")


class BancoWorkspaceTest(unittest.TestCase):
    def render(self, *, meters=True, split_key="1", preview_width=477, media_width=550):
        with tempfile.TemporaryDirectory(prefix="banco-workspace-") as temp:
            fixture = Path(temp) / "desk.slint"
            screenshot = fixture.with_suffix(".png")
            fixture.write_text(f"""
import {{ Workspace }} from "{UI / 'workspace/workspace.slint'}";
import {{ Editor }} from "{UI / 'editor.slint'}";
import {{ PaneKind }} from "{UI / 'workspace/pane-switcher.slint'}";
export component Desk inherits Window {{
    Workspace {{}}
    init => {{
        Editor.seats = [
            {{ index: 0, kind: PaneKind.media, x: 8px, y: 8px, width: {media_width}px, height: 360px }},
            {{ index: 1, kind: PaneKind.preview, x: 566px, y: 8px, width: {preview_width}px, height: 360px }},
            {{ index: 2, kind: PaneKind.timeline, x: 8px, y: 376px, width: 1035px, height: 416px }},
            {{ index: 3, kind: PaneKind.inspector, x: 1051px, y: 8px, width: 341px, height: 784px }},
        ];
        Editor.dividers = [
            {{ index: 0, columns: true, x: 1043px, y: 8px, width: 8px, height: 784px }},
            {{ index: 1, columns: false, x: 8px, y: 368px, width: 1035px, height: 8px }},
            {{ index: 2, columns: true, x: 558px, y: 8px, width: 8px, height: 360px }},
        ];
        Editor.meters-shown = {str(meters).lower()};
        Editor.keys-split = "{split_key}";
        Editor.timeline-tabs = [{{ name: "Assembly" }}];
        Editor.timeline-current-tab = 0;
        Editor.output-width = 1920;
        Editor.output-height = 1080;
        Editor.frame-rate = 30;
        Editor.seconds-per-pixel = 0.05;
        Editor.playhead = 5;
        Editor.preview-duration = 10;
        Editor.duration-seconds = 10;
    }}
}}
""", encoding="utf-8")
            subprocess.run(
                [VIEWER, "--size", "1400x800", "--screenshot", screenshot, fixture],
                env=os.environ | {
                    "CUDA_VISIBLE_DEVICES": "",
                    "LIBGL_ALWAYS_SOFTWARE": "1",
                    "RAYON_NUM_THREADS": "2",
                    "SLINT_SCALE_FACTOR": "1",
                },
                check=True,
                capture_output=True,
                text=True,
                timeout=60,
            )
            with Image.open(screenshot) as image:
                return image.convert("RGB")

    @staticmethod
    def pixels(image, box):
        for y in range(box[1], box[3]):
            for x in range(box[0], box[2]):
                yield image.getpixel((x, y))

    def dial_pixels(self, image):
        return sum(
            red > 180 and green > 140 and red > blue + 30
            for red, green, blue in self.pixels(image, (1065, 20, 1378, 90))
        )

    def test_inspector_is_free_of_dials_even_with_meters_enabled(self):
        self.assertLess(self.dial_pixels(self.render()), 1_000)
        self.assertLess(self.dial_pixels(self.render(meters=False)), 1_000)

    def test_import_does_not_stretch_with_media_header(self):
        # The left edge, icon and label stay put; spare width goes to the tabs.
        box = (16, 17, 123, 48)
        self.assertEqual(self.render().crop(box).tobytes(),
                         self.render(media_width=400).crop(box).tobytes())

    def test_monitor_scrub_marker_tracks_playhead_fraction(self):
        image = self.render()
        self.assertTrue(any(
            red > 215 and green > 165 and blue < 120
            for red, green, blue in self.pixels(image, (799, 308, 810, 325))
        ))
    def test_edit_keys_are_above_sequence_tabs(self):
        image = self.render()
        self.assertTrue(any(
            red > 215 and green > 165 and blue < 120
            for red, green, blue in self.pixels(image, (12, 378, 65, 402))
        ))
        self.assertTrue(any(
            red < 130 and green > 175 and blue > 175
            for red, green, blue in self.pixels(image, (12, 413, 80, 420))
        ))

    def test_rebound_split_legend_changes_and_can_be_unbound(self):
        box = (12, 378, 65, 395)
        default = list(self.pixels(self.render(), box))
        rebound = list(self.pixels(self.render(split_key="F8"), box))
        unbound = list(self.pixels(self.render(split_key="—"), box))
        self.assertNotEqual(default, rebound)
        self.assertNotEqual(rebound, unbound)

    def test_monitor_duration_appears_at_transport_minimum(self):
        def duration_digits(width):
            image = self.render(preview_width=width)
            right = 566 + width
            return sum(
                green > 210 and red < 150 and 100 < blue < 200
                for red, green, blue in self.pixels(image, (right - 70, 337, right - 20, 352))
            )

        self.assertEqual(duration_digits(381), 0)
        self.assertGreater(duration_digits(382), 0)


if __name__ == "__main__":
    unittest.main()
