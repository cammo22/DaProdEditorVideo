#!/usr/bin/env python3
"""Generate tiny A/V fixtures, run an existing desktop binary, check its actual export."""
import argparse
import array
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def ff(*args):
    return subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-filter_threads", "1",
                                    "-threads", "1", *map(str, args)], timeout=60)


def fixture(path, color, hz, duration=2):
    ff("-f", "lavfi", "-i", f"color={color}:size=320x180:rate=30:duration={duration}",
       "-f", "lavfi", "-i", f"sine=frequency={hz}:sample_rate=48000:duration={duration}",
       "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-threads", "1",
       "-c:a", "aac", path)


def verify(path):
    info = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_format",
                                               "-show_streams", "-of", "json", path], timeout=20))
    duration = float(info["format"]["duration"])
    streams = [s["codec_type"] for s in info["streams"]]
    if streams.count("audio") != 1 or streams.count("video") != 1 or abs(duration - 3) > 0.09:
        raise ValueError(f"unexpected streams or duration: {streams}, {duration}s")
    print(f"{path.name}: {duration:.3f} s", flush=True)
    for t, channel, hz in [(0.2, 0, 440), (0.7, 0, 440), (1.1, 2, 880), (2.6, 2, 880)]:
        rgb = ff("-ss", t, "-i", path, "-map", "0:v:0", "-frames:v", "1", "-vf",
                 "scale=1:1:flags=area", "-pix_fmt", "rgb24", "-f", "rawvideo", "-")
        if len(rgb) != 3 or rgb[channel] < 150 or any(v > 90 for i,v in enumerate(rgb) if i != channel):
            raise ValueError(f"wrong colour at {t}s: RGB {list(rgb)}")
        pcm = array.array("h")
        pcm.frombytes(ff("-ss", t, "-i", path, "-map", "0:a:0", "-t", "0.2", "-ac", "1",
                         "-ar", "16000", "-f", "s16le", "-"))
        if sys.byteorder != "little":
            pcm.byteswap()
        if len(pcm) != 3200 or max(pcm) < 100:
            raise ValueError(f"missing or silent audio at {t}s")
        crossings = sum(x <= 0 < y for x, y in zip(pcm, pcm[1:]))
        measured = crossings * 16000 / len(pcm)
        # A matching crossing count alone can also be noise. Check energy at the target.
        power = sum(x*x for x in pcm)
        phase = 2 * math.pi * hz / 16000
        tone = sum(x*math.cos(i*phase) for i,x in enumerate(pcm))**2 + sum(
            x*math.sin(i*phase) for i,x in enumerate(pcm))**2
        if abs(measured - hz) > 10 or 2*tone/(len(pcm)*power) < .75:
            raise ValueError(f"wrong tone at {t}s: {measured:.0f} Hz, expected {hz}")
        print(f"  {t:.1f}s RGB={list(rgb)} {measured:.0f} Hz", flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument("--bin", type=Path, help="packaged binary (or AppRun) containing --smoke-banco")
    modes.add_argument("--self-test", action="store_true", help="exercise verifier only, not editor")
    modes.add_argument("--verify", type=Path, help="remeasure an existing export")
    args = p.parse_args()
    if args.verify:
        verify(args.verify)
        return
    work = Path(tempfile.mkdtemp(prefix="banco-qa-"))
    print(f"QA directory: {work}", flush=True)
    fixture(work/"red.mp4", "red", 440)
    fixture(work/"blue.mp4", "blue", 880)
    if args.self_test:
        # Independent known answer. Never use this path as the application output.
        fixture(work/"short.mp4", "red", 440, 1)
        for first, second, name in [("short", "blue", "reference"), ("blue", "short", "reversed")]:
            listing = work / "inputs.txt"
            listing.write_text(f"file '{first}.mp4'\nfile '{second}.mp4'\n", encoding="ascii")
            ff("-f", "concat", "-safe", "1", "-i", listing, "-c", "copy", work/f"{name}.mp4")
        verify(work/"reference.mp4")
        ff("-i", work/"reference.mp4", "-f", "lavfi", "-i", "sine=frequency=660:duration=3",
           "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", work/"wrong-tone.mp4")
        for bad in ["red.mp4", "reversed.mp4", "wrong-tone.mp4"]:
            try:
                verify(work/bad)
            except ValueError as exc:
                print(f"correctly rejected {bad}: {exc}")
            else:
                raise RuntimeError(f"accepted negative control {bad}")
        return
    home = work / "home"
    home.mkdir()
    env = dict(os.environ, HOME=str(home), USERPROFILE=str(home), CONCAT_GPU="software",
               SLINT_BACKEND="winit-software", RAYON_NUM_THREADS="1")
    for key, folder in [("XDG_CONFIG_HOME", "config"), ("XDG_DATA_HOME", "data"),
                        ("XDG_CACHE_HOME", "cache"), ("XDG_STATE_HOME", "state"),
                        ("APPDATA", "roaming"), ("LOCALAPPDATA", "local")]:
        env[key] = str(home/folder)
    subprocess.run([args.bin.resolve(), "--smoke-banco", work], env=env, check=True, timeout=360)
    verify(work/"result.mp4")


if __name__ == "__main__":
    main()
