#!/usr/bin/env python3
"""Compile or capture the desktop Slint scenes without building the Rust app."""

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
CRATE = ROOT / "src/crates/concat"
SCENES = ("home", "montaggio", "impostazioni", "export")


def quote(value):
    return json.dumps(value, ensure_ascii=False)


def translations(ui):
    en, it = (
        {key: value for key, value in json.loads(
            (CRATE / f"locales/{language}.json").read_text(encoding="utf-8")
        ).items() if isinstance(value, str)}
        for language in ("en", "it")
    )
    catalog = en | it
    literal_keys = {
        key
        for source in ui.rglob("*.slint")
        for key in re.findall(r'I18n\.(?:t|t1|t2|upper)\("([^"]+)"', source.read_text()) if key != "area.name"
    }
    if missing := literal_keys - catalog.keys():
        print(f"Missing catalog keys: {', '.join(sorted(missing))}")

    def branches(entries, format_value):
        return "\n".join(
            f"        if (key == {quote(key)}) {{ return {format_value(value)}; }}"
            for key, value in sorted(entries.items())
        )

    def formatted(value, second=False):
        parts = re.split(r"(\{[01]\})", value)
        return " + ".join(
            {"{0}": "a", "{1}": "b" if second else quote("{1}")}[part] if part in ("{0}", "{1}") else quote(part)
            for part in parts if part
        )

    def with_slots(*slots):
        return {key: value for key, value in catalog.items()
                if any(slot in value for slot in slots)}

    source = (ui / "i18n.slint").read_text()
    source = source.replace('lang: "en";', 'lang: "it";')
    callbacks = (
        ("lookup(lang, key)", branches(catalog, quote), quote("⟦traduzione mancante⟧")),
        ("lookup1(lang, key, a)", branches(with_slots("{0}"), formatted), "lookup(lang, key)"),
        ("lookup2(lang, key, a, b)", branches(with_slots("{0}", "{1}"), lambda value: formatted(value, second=True)), "lookup(lang, key)"),
        ("lookup-upper(lang, key)", branches(catalog, lambda value: quote(value.upper())), quote("⟦TRADUZIONE MANCANTE⟧")),
    )
    for signature, cases, fallback in callbacks:
        old = f"{signature} => {{ return key; }}"
        if old not in source:
            raise ValueError(f"Could not locate {signature} in i18n.slint")
        source = source.replace(old, f"{signature} => {{\n{cases}\n        return {fallback};\n    }}")
    (ui / "i18n.slint").write_text(source)


def dock_models(width, height):
    # Mirror the published coordinates and parent-first indices in dock.rs
    # and studio/publish.rs. Read the ratios and gutter from their source.
    source = (CRATE / "src/dock.rs").read_text()
    gap = float(re.search(r"const SEAT_GAP: f32 = ([\d.]+);", source)[1])
    default = source.split("pub fn default_dock()", 1)[1].split("\n}", 1)[0]
    nodes = iter(re.findall(
        r"columns: (true|false),\s*ratio: ([\d.]+)|Dock::leaf\(PaneKind::(\w+)\)", default
    ))

    def read_node():
        columns, ratio, pane = next(nodes)
        if pane:
            return pane.lower()
        return columns == "true", float(ratio), read_node(), read_node()

    tree = read_node()
    if next(nodes, None) is not None:
        raise ValueError("Unrecognized default dock tree")
    seats, dividers = [], []

    def box(x, y, w, h):
        return f"x: {x:.6f}px, y: {y:.6f}px, width: {w:.6f}px, height: {h:.6f}px"

    def place(node, x, y, w, h):
        if isinstance(node, str):
            seats.append(f"{{ index: {len(seats)}, kind: PaneKind.{node}, {box(x, y, w, h)} }}")
            return
        columns, ratio, first, second = node
        usable = (w if columns else h) - gap
        head = usable * ratio
        tail = usable - head
        gutter = box(x + head, y, gap, h) if columns else box(x, y + head, w, gap)
        dividers.append(f"{{ index: {len(dividers)}, columns: {str(columns).lower()}, {gutter} }}")
        if columns:
            place(first, x, y, head, h)
            place(second, x + head + gap, y, tail, h)
        else:
            place(first, x, y, w, head)
            place(second, x, y + head + gap, w, tail)

    place(tree, gap, gap, width - 2 * gap, height - 2 * gap)
    return seats, dividers


def fixture(scene, width, height):
    title = (CRATE / "ui/title-bar.slint").read_text().split("export component TitleBar", 1)[1]
    title_height = int(re.search(r"^    height: (\d+)px;", title, re.MULTILINE)[1])
    seats, dividers = dock_models(width, height - title_height)
    version = re.search(r'^version = "(.*?)"', (ROOT / "src/Cargo.toml").read_text(), re.MULTILINE)[1]
    home = scene in ("home", "nuovo-progetto")
    project_sheet = '''
    start-aspects: [{label: "16:9", ratio: 1.7778}, {label: "9:16", ratio: 0.5625},
                    {label: "1:1", ratio: 1}, {label: "4:5", ratio: 0.8}, {label: "3:4", ratio: 0.75},
                    {label: "4:3", ratio: 1.3333}, {label: "21:9", ratio: 2.3704}];
    start-sizes: [{label: "720p"}, {label: "1080p"}, {label: "1440p"}, {label: "4K"}];
    start: {composing: true, name: "Ritratti", location: "/fixture/Progetti", size: 4,
        custom-width: "1280", custom-height: "720", size-readout: "1280 × 720", valid-resolution: true,
        frame-aspect: 1.7778, rate: 6, rate-options: ["10 fps", "20 fps", "23.976 fps", "24 fps",
            "25 fps", "29.97 fps", "30 fps", "48 fps", "50 fps", "59.94 fps", "60 fps"],
        rate-readout: "30/1 fps", canvas: #000, preset-name: "Banco HD",
        preset-options: ["Banco HD · 1280 × 720"]};''' if scene == "nuovo-progetto" else ""
    settings = scene == "impostazioni"
    return f"""
import {{ App, ClipKind, Editor, MediaKind, Meters, PaneKind }} from "app.slint";

export component Capture inherits App {{
    on-start: {str(home).lower()};
    {project_sheet}
    own-window-buttons: true;
    app-version: {quote(version)};
    can-drop: true;
    project-name: "Banco di montaggio";
    recents-total: 3;
    recents: [
        {{ path: "/fixture/ritratti", name: "Ritratti in città", frame: "1920 × 1080", when: "Ieri", length: "0:32", ratio: 1.7778, poster: @image-url("assets/motion-still.jpg") }},
        {{ path: "/fixture/lago", name: "Una giornata al lago", frame: "1920 × 1080", when: "3 giorni fa", length: "0:48", ratio: 1.7778 }},
        {{ path: "/fixture/viaggio", name: "Appunti di viaggio", frame: "1920 × 1080", when: "Una settimana fa", length: "2:15", ratio: 1.7778 }},
    ];
    settings: {{ open: {str(settings).lower()}, tab: 1, layout-switchable: true, gpu-switchable: true }};
    export: {{ open: {str(scene == "export").lower()}, name: "Ritratti", path: "/fixture/Ritratti.mp4",
        format: "1920 × 1080 · 30 fps", duration: "00:00:32:00", contents: "3 clip",
        resolutions: ["1920 × 1080"], rates: ["30 fps"], h264-encodable: true,
        rate-controlled: true, target: 12, encoding: "H.264", size-chosen: "48 MB" }};
    languages: ["Italiano"];

    init => {{
        Editor.seats = [{", ".join(seats)}];
        Editor.dividers = [{", ".join(dividers)}];
        Editor.output-width = 1920;
        Editor.output-height = 1080;
        Editor.frame-rate = 30;
        Editor.seconds-per-pixel = 0.05;
        Editor.snap = true;
        Meters.left = 0.72;
        Meters.right = 0.64;
        Meters.hold-left = 0.83;
        Meters.hold-right = 0.77;
        Editor.timeline-tabs = [{{ id: "banco", name: "Montaggio" }}];
        Editor.duration-seconds = 32;
        Editor.playhead = 8.4;
        Editor.has-picture = true;
        Editor.preview-duration = 32;
        Editor.preview-frame = @image-url("assets/motion-still.jpg");
        Editor.project-name = "Banco di montaggio";
        Editor.project-folder = "/fixture/ritratti";
        Editor.timeline-name = "Montaggio";
        Editor.project-output = "1920 × 1080";
        Editor.project-rate = "30 fps";
        Editor.project-duration = "00:00:32:00";
        Editor.media-count-all = 2;
        Editor.media-count-video = 1;
        Editor.media-count-audio = 1;
        Editor.media = [
            {{ id: 1, name: "Ritratti in città.mp4", kind: MediaKind.video, duration: 24,
                thumbnail: @image-url("assets/motion-still.jpg") }},
            {{ id: 2, name: "Ambiente.wav", kind: MediaKind.audio, duration: 32 }},
        ];
        Editor.tracks = [
            {{ id: "principale", visible: true, height: 64px }},
            {{ id: "ambiente", visible: true, height: 44px, top: 64px }},
        ];
        Editor.clips = [
            {{ id: "ritratti", row: 0, name: "Ritratti in città", kind: ClipKind.video, duration: 14 }},
            {{ id: "titolo", row: 0, name: "Ritratti in città", kind: ClipKind.text,
                start: 14, duration: 7, text-body: "Ritratti in città" }},
            {{ id: "audio", row: 1, name: "Ambiente", kind: ClipKind.audio, duration: 32, volume: 1 }},
        ];
    }}
}}
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compile scenes without a display")
    parser.add_argument("--out", type=Path, default=ROOT / "docs/catture-banco")
    parser.add_argument("--size", default="1400x900")
    parser.add_argument("--scene", choices=(*SCENES, "nuovo-progetto"), action="append")
    parser.add_argument("--viewer", type=Path, default=Path(tempfile.gettempdir()) /
                        "banco-slint/slint-viewer/slint-viewer")
    args = parser.parse_args()
    match = re.fullmatch(r"(\d+)x(\d+)", args.size)
    if not match or int(match[1]) < 1200 or int(match[2]) < 650:
        parser.error("--size must be at least 1200x650 for the wide desktop fixture")
    width, height = map(int, match.groups())
    # With no --backend override, viewer 1.18.1 uses an offscreen Skia
    # SoftwareSurface. Explicit winit software would require a display.
    env = os.environ | {"SLINT_SCALE_FACTOR": "1", "CUDA_VISIBLE_DEVICES": "",
                        "LIBGL_ALWAYS_SOFTWARE": "1", "RAYON_NUM_THREADS": "2"}
    with tempfile.TemporaryDirectory(prefix="capture-banco-") as temp:
        sandbox = Path(temp)
        ui = sandbox / CRATE.relative_to(ROOT) / "ui"
        shutil.copytree(CRATE / "ui", ui)
        (sandbox / "assets").symlink_to(ROOT / "assets", target_is_directory=True)
        (ui.parent.parent / "concat-text").symlink_to(CRATE.parent / "concat-text", target_is_directory=True)
        translations(ui)
        for scene in args.scene or SCENES:
            entry = ui / "capture.slint"
            entry.write_text(fixture(scene, width, height))
            command = [str(args.viewer.resolve()), str(entry)]
            if args.check:
                subprocess.run(command + ["--check"], env=env, check=True)
            else:
                image = sandbox / f"{scene}.png"
                subprocess.run(command + ["--screenshot", str(image), "--size", args.size],
                               env=env, check=True)
                with image.open("rb") as stream:
                    header = stream.read(24)
                if header[:16] != b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" or struct.unpack(">II", header[16:]) != (width, height):
                    raise ValueError(f"Unexpected PNG header or size: {image.name}")
            print(f"{scene}: {'compiled' if args.check else args.size}", flush=True)
        if not args.check:
            args.out.mkdir(parents=True, exist_ok=True)
            for scene in args.scene or SCENES:
                shutil.copyfile(sandbox / f"{scene}.png", args.out / f"{scene}.png")


if __name__ == "__main__":
    main()
