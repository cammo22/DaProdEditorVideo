# Banco: desktop edit and export smoke test

Use a **built desktop artifact of this revision**. No rebuild in the test. Run on a software-only CI runner (Linux: Xvfb and Mesa software drivers) with Python 3, FFmpeg with libx264/AAC/lavfi, and ffprobe on PATH. Run one instance at a time.

```
# Linux: point at the packaged launcher (AppRun in an extracted AppImage).
xvfb-run -a python3 scripts/ci/smoke-banco.py --bin /path/to/squashfs-root/AppRun
# Windows: from a desktop session, using the packaged executable.
python scripts/ci/smoke-banco.py --bin C:\path\to\concat.exe
```

The script creates a fresh QA directory, prints its path, generates two 2-second 320×180 clips with embedded audio, and starts `--smoke-banco <directory>` with isolated preference paths. It leaves the saved project, fixtures and a copy of the actual export (`result.mp4`) there for diagnosis. The driver uses the window event loop and the app's import/export messages. It sends the Slint key, press, drag and release callbacks, not OS-level input or coordinate clicks on toolbar buttons.

1. Place red/440 Hz then blue/880 Hz. Cut red at 1 s with **1**, remove the first half with **3** (ripple).
2. Select both, join with **S**, dissolve via the Banco button's callback, undo/redo and rejoin with **4**.
3. Save, close the session, reopen from disk. Press blue, drag both clips forward 2 s, check both starts, undo the drag and export the 3-second cut.
4. ffprobe checks one video and one audio stream and duration (3 s ± 90 ms). FFmpeg decodes video and PCM at 0.2, 0.7, 1.1 and 2.6 s to check colour order, audio level and frequency. Any failed check or app timeout returns nonzero.

```
python3 scripts/ci/smoke-banco.py --verify /path/to/result.mp4
python3 scripts/ci/smoke-banco.py --self-test
```

`--self-test` runs only the media generator and verifier: an independent FFmpeg reference must pass, while wrong length, reversed colours and wrong tone must fail. It does **not** test the application. The normal run never substitutes a reference for the editor export.
