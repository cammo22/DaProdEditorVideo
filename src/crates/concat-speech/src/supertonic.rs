// SPDX-License-Identifier: AGPL-3.0-or-later
use crate::DownloadProgress;
use std::{
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};
pub const BUNDLE_ID: &str = "supertonic-3-it";
struct KnownModel {
    /// What the file is called on the mirror: the bundle's name and the
    /// file's own, so two exports never collide on one flat release.
    id: &'static str,
    /// What the file is called on disk, which is what the graphs expect
    /// of their weights.
    local: &'static str,
    upstream: &'static str,
    bytes: u64,
    sha256: &'static str,
}

const FILES: &[KnownModel] = &[
    KnownModel {
        id: "supertonic-3-LICENSE",
        local: "LICENSE",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/LICENSE",
        bytes: 15007,
        sha256: "0d944a9110fed9a9602d60e0423a272903e7bd21ab060490774efc77c2275e9f",
    },
    KnownModel {
        id: "supertonic-3-duration_predictor.onnx",
        local: "onnx/duration_predictor.onnx",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/duration_predictor.onnx",
        bytes: 3700147,
        sha256: "c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db",
    },
    KnownModel {
        id: "supertonic-3-text_encoder.onnx",
        local: "onnx/text_encoder.onnx",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/text_encoder.onnx",
        bytes: 36416150,
        sha256: "c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff",
    },
    KnownModel {
        id: "supertonic-3-tts.json",
        local: "onnx/tts.json",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/tts.json",
        bytes: 8253,
        sha256: "42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09",
    },
    KnownModel {
        id: "supertonic-3-unicode_indexer.json",
        local: "onnx/unicode_indexer.json",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/unicode_indexer.json",
        bytes: 277676,
        sha256: "9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f",
    },
    KnownModel {
        id: "supertonic-3-vector_estimator.onnx",
        local: "onnx/vector_estimator.onnx",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/vector_estimator.onnx",
        bytes: 256534781,
        sha256: "883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c",
    },
    KnownModel {
        id: "supertonic-3-vocoder.onnx",
        local: "onnx/vocoder.onnx",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/onnx/vocoder.onnx",
        bytes: 101424195,
        sha256: "085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba",
    },
    KnownModel {
        id: "supertonic-3-F1.json",
        local: "voice_styles/F1.json",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/F1.json",
        bytes: 292046,
        sha256: "bbdec6ee00231c2c742ad05483df5334cab3b52fda3ba38e6a07059c4563dbc2",
    },
    KnownModel {
        id: "supertonic-3-F2.json",
        local: "voice_styles/F2.json",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/F2.json",
        bytes: 292423,
        sha256: "7c722c6a72707b1a77f035d67f0d1351ba187738e06f7683e8c72b1df3477fc6",
    },
    KnownModel {
        id: "supertonic-3-F3.json",
        local: "voice_styles/F3.json",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/F3.json",
        bytes: 290794,
        sha256: "12f6ef2573baa2defa1128069cb59f203e3ab67c92af77b42df8a0e3a2f7c6ab",
    },
    KnownModel {
        id: "supertonic-3-M1.json",
        local: "voice_styles/M1.json",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/M1.json",
        bytes: 291748,
        sha256: "e35604687f5d23694b8e91593a93eec0e4eca6c0b02bb8ed69139ab2ea6b0a5b",
    },
    KnownModel {
        id: "supertonic-3-M2.json",
        local: "voice_styles/M2.json",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/M2.json",
        bytes: 292055,
        sha256: "b76cbf62bac707c710cf0ae5aba5e31eea1a6339a9734bfae33ab98499534a50",
    },
    KnownModel {
        id: "supertonic-3-M3.json",
        local: "voice_styles/M3.json",
        upstream: "https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/voice_styles/M3.json",
        bytes: 290198,
        sha256: "ea1ac35ccb91b0d7ecad533a2fbd0eec10c91513d8951e3b25fbba99954e159b",
    },
];
pub const BUNDLE_BYTES: u64 = 400125473;
/// Whether every file of the bundle is in `dir`, whole.
pub fn installed(dir: &Path) -> bool {
    FILES.iter().all(|file| {
        std::fs::metadata(dir.join(file.local))
            .is_ok_and(|meta| meta.is_file() && meta.len() == file.bytes)
    })
}

/// Install the licence, shared graphs and six presets as one settings download.
pub fn download(
    dir: &Path,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(DownloadProgress),
) -> Result<(), String> {
    concat_vision::runtime::ready()?;
    let total: u64 = FILES.iter().map(|file| file.bytes).sum();
    let mut before: u64 = 0;
    for file in FILES {
        let target = dir.join(file.local);
        if std::fs::metadata(&target).is_ok_and(|meta| meta.is_file() && meta.len() == file.bytes) {
            before += file.bytes;
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
        }
        let partial = target.with_extension(match target.extension().and_then(|e| e.to_str()) {
            Some(extension) => format!("{extension}.part"),
            None => "part".to_owned(),
        });
        let so_far = before;
        crate::fetch_model(
            file.id,
            file.upstream,
            &partial,
            BUNDLE_ID,
            file.bytes,
            file.sha256,
            cancel,
            &mut |report: DownloadProgress| {
                progress(DownloadProgress {
                    id: BUNDLE_ID.to_owned(),
                    received: so_far + report.received.min(file.bytes),
                    total,
                    unpacking: false,
                    done: false,
                });
            },
        )?;
        std::fs::rename(&partial, &target)
            .map_err(|error| format!("could not finish {}: {error}", target.display()))?;
        before += file.bytes;
        if cancel.load(Ordering::Relaxed) {
            return Err("download cancelled".to_owned());
        }
    }
    progress(DownloadProgress {
        id: BUNDLE_ID.to_owned(),
        received: total,
        total,
        unpacking: false,
        done: true,
    });
    Ok(())
}
