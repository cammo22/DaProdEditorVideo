#![cfg(feature = "chatterbox")]

use concat_host::{AppDirs, projects};
use concat_speech::{Speech, Transcriber, transcribe::TranscribeRequest, tts::SpeakRequest};

#[test]
#[ignore = "downloads 590 MB and runs six CPU round trips; use an empty temporary directory"]
fn italian_download_and_round_trip() -> Result<(), String> {
    let root = std::env::var("DAP_SPEECH_TEST_DIR").expect("set DAP_SPEECH_TEST_DIR");
    let dirs = AppDirs {
        data: std::path::Path::new(&root).join("data"),
        config: std::path::Path::new(&root).join("config"),
    };
    let project = projects::create(&root, "Speech test", 640, 480, 25, 1, [0, 0, 0, 255])?;
    let speech = Speech::new();
    let asr = Transcriber::new();
    let model = "supertonic-3-it";
    let whisper = "small-q5_1";
    speech.download_model(&dirs, model, |_| {})?;
    asr.download_model(&dirs, whisper, |_| {})?;
    assert!(
        Speech::status(&dirs)?
            .models
            .iter()
            .any(|m| m.id == model && m.downloaded)
    );
    assert!(
        Transcriber::status(&dirs)?
            .models
            .iter()
            .any(|m| m.id == whisper && m.downloaded)
    );
    for voice in 4000..=4005 {
        let wav = speech.speak(
            &dirs,
            &SpeakRequest {
                model_id: model.into(),
                voice,
                reference: None,
                text: "Oggi il mare è calmo e il cielo è sereno.".into(),
                speed: 1.0,
                project: project.path.clone(),
            },
            |_| {},
        )?;
        let segments = asr.transcribe(
            &dirs,
            &TranscribeRequest {
                path: wav.path,
                audio_stream: None,
                source_start: 0.,
                window: wav.duration,
                model_id: whisper.into(),
                language: Some("it".into()),
            },
            |_| {},
        )?;
        let words = segments
            .iter()
            .map(|s| s.text.as_str())
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        eprintln!("{voice}: {words}");
        assert!(
            words.contains("mare") && words.contains("cielo"),
            "{voice}: {words}"
        );
    }
    Ok(())
}
