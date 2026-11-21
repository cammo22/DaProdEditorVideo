// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Jareer Abdullah and Concat contributors

use std::collections::{HashMap, HashSet};

use concat_project::model::Timeline;

pub(super) fn clip_ids(timeline: &Timeline) -> HashSet<String> {
    timeline.clips.iter().map(|clip| clip.id.clone()).collect()
}

pub(super) fn select_shorter_segments(
    timeline: &Timeline,
    original_durations: &HashMap<String, f64>,
    selection: &mut Vec<String>,
    time: f64,
    fps: f64,
) {
    // Playhead rounding moves the head and tail durations in opposite
    // directions. Bound the tolerance well below a frame.
    let tie_tolerance = (time.abs().max(1.0) * f64::from(f32::EPSILON)).min(0.25 / fps);

    // SplitClips keeps the original ID on the head and inserts the tail
    // directly after it. A head with unchanged duration was skipped.
    for pair in timeline.clips.windows(2) {
        let (head, tail) = (&pair[0], &pair[1]);
        if original_durations
            .get(&head.id)
            .is_some_and(|original| head.duration < *original)
        {
            let shorter = if tail.duration - head.duration <= tie_tolerance {
                &tail.id
            } else {
                &head.id
            };
            if let Some(id) = selection.iter_mut().find(|id| **id == head.id) {
                id.clone_from(shorter);
            } else {
                selection.push(shorter.clone());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use concat_project::model::{Clip, ClipKind, Project};
    use concat_project::{Command, DocumentSettings, Editor};
    use std::sync::Arc;

    fn editor_with_clips(clips: &[(&str, f64, f64)]) -> Editor {
        let mut project = Project::default();
        let timeline = project.active_mut();
        let track = timeline.tracks[0].id.clone();
        timeline.clips = clips
            .iter()
            .map(|&(id, start, duration)| {
                Arc::new(Clip::blank(id, &track, ClipKind::Text, "", start, duration))
            })
            .collect();
        let video = &timeline.video;
        let settings = DocumentSettings {
            name: "Split selection".to_owned(),
            width: video.width,
            height: video.height,
            rate_num: video.rate_num,
            rate_den: video.rate_den,
            canvas: video.canvas,
        };
        let document = concat_project::doc::to_document(&settings, &project);
        Editor::from_document(&document).unwrap()
    }

    #[test]
    fn split_selection_chooses_shorter_for_each_clip_and_right_on_ties() {
        let mut editor = editor_with_clips(&[
            ("c1", 4.0, 6.0),
            ("c2", 0.0, 6.0),
            ("c3", 2.0, 6.0),
            ("c4", 5.0, 1.0),
            ("c5", 4.0, 1.0),
            ("c6", 0.0, 1.0),
        ]);
        let original = [
            ("c1", 6.0),
            ("c2", 6.0),
            ("c3", 6.0),
            ("c4", 1.0),
            ("c5", 1.0),
        ]
        .map(|(id, duration)| (id.to_owned(), duration))
        .into_iter()
        .collect();
        editor
            .apply(Command::SplitClips {
                clip_ids: (1..=5).map(|index| format!("c{index}")).collect(),
                time: 5.0,
            })
            .unwrap();

        let timeline = editor.project().active();
        let mut selection = vec!["c2".to_owned(), "c4".to_owned(), "c6".to_owned()];
        select_shorter_segments(timeline, &original, &mut selection, 5.0, 30.0);
        let tail_c2 = &timeline.clips[3];
        let tail_c3 = &timeline.clips[5];
        assert_eq!(tail_c2.duration, 1.0);
        assert_eq!(tail_c3.duration, 3.0);
        assert_eq!(
            selection,
            [tail_c2.id.as_str(), "c4", "c6", "c1", &tail_c3.id]
        );
    }

    #[test]
    fn empty_selection_picks_rounded_midpoint_tail_but_respects_one_frame_difference() {
        let fps = 30.0;
        let midpoint = 31.0 / fps;
        let time = f64::from(midpoint as f32);
        assert!(time < midpoint);
        let clips = [("c1", 0.0, 62.0 / fps), ("c2", 0.0, 63.0 / fps)];
        let mut editor = editor_with_clips(&clips);
        let original = clips
            .map(|(id, _, duration)| (id.to_owned(), duration))
            .into_iter()
            .collect();
        editor
            .apply(Command::SplitClips {
                clip_ids: vec!["c1".to_owned(), "c2".to_owned()],
                time,
            })
            .unwrap();

        let timeline = editor.project().active();
        assert!(timeline.clips[1].duration > timeline.clips[0].duration);
        let mut selection = Vec::new();
        select_shorter_segments(timeline, &original, &mut selection, time, fps);
        assert_eq!(selection, [timeline.clips[1].id.as_str(), "c2"]);
    }

    #[test]
    fn split_selection_tail_ids_disappear_on_undo() {
        let mut editor = editor_with_clips(&[("c1", 0.0, 6.0), ("c2", 4.0, 6.0)]);
        let original = HashMap::from([("c1".to_owned(), 6.0), ("c2".to_owned(), 6.0)]);
        editor
            .apply(Command::SplitClips {
                clip_ids: vec!["c1".to_owned(), "c2".to_owned()],
                time: 5.0,
            })
            .unwrap();
        let mut selection = Vec::new();
        select_shorter_segments(
            editor.project().active(),
            &original,
            &mut selection,
            5.0,
            30.0,
        );
        assert!(editor.undo());
        let survivors = clip_ids(editor.project().active());
        selection.retain(|id| survivors.contains(id));
        assert_eq!(selection, ["c2"]);
        assert_eq!(editor.project().active().clips.len(), 2);
    }
}
