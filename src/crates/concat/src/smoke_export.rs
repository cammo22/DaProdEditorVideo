// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Jareer Abdullah

//! CI's export run: a project made of one clip and exported, by the same
//! messages the launch screen, the media bin and the Export sheet send, in
//! the window's event loop and from inside its events, the way a person's
//! taps start them. A launch-only smoke run never reached an export, and
//! 0.2.10 and 0.2.11 shipped with every export on every phone freezing the
//! window the moment it started (#747, #786).
//!
//! Each step waits for the one before to have landed - the project open,
//! the clip probed into the bin, the clip on the timeline - and the run
//! ends when the export does: status 0 with "smoke: export finished" in the
//! log, 1 with the reason. A step that does not land within
//! [`STEP_LIMIT`] ends it as well, with the step named; a window that has
//! stopped answering is what the caller's own clock and the system's
//! not-responding report are for, since a stuck event loop runs no timer.

use std::cell::{Cell, RefCell};
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::host::Shell;
use crate::panes::Msg;
use crate::panes::export::ExportMsg;
use crate::panes::media_bin::MediaMsg;
use crate::panes::start::StartMsg;
use crate::ui::ExportPhase;

/// How long one step may take before the run fails on it. An export of a
/// short clip on an emulator in software is well under a minute.
const STEP_LIMIT: Duration = Duration::from_secs(240);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Step {
    /// The clip dropped on the launch screen, and its project made.
    Make,
    /// The project is open: waiting for the clip to be probed into the bin.
    Place,
    /// The clip is on its way to the timeline: Export once it is there.
    Export,
    BancoEdit,
    /// The export is running.
    Watch,
}

impl Step {
    fn waiting_for(self) -> &'static str {
        match self {
            Step::Make => "the project to open",
            Step::Place => "the clip to reach the bin",
            Step::Export => "the clip to reach the timeline",
            Step::BancoEdit => "both clips on the timeline",
            Step::Watch => "the export to end",
        }
    }
}

/// Starts the run's steps on a timer of the window's event loop; the timer
/// is held for as long as the loop runs.
pub(crate) fn drive(clip: PathBuf, banco: Option<PathBuf>) -> slint::Timer {
    log::info!("smoke: exporting {}", clip.display());
    let step = Cell::new(Step::Make);
    let since = Cell::new(Instant::now());
    let began = RefCell::new(None::<Instant>);
    let timer = slint::Timer::default();
    timer.start(
        slint::TimerMode::Repeated,
        Duration::from_millis(250),
        move || {
            Shell::with(|shell, app| {
                // Something else of the window's has the studio this tick.
                let Ok(mut studio) = shell.studio.try_borrow_mut() else {
                    return;
                };
                let now = step.get();
                let next = match now {
                    Step::Make => {
                        let mut paths = vec![clip.clone()];
                        if let Some(dir) = &banco {
                            paths.push(dir.join("blue.mp4"));
                            if !paths.iter().all(|p| p.is_file()) || dir.join("result.mp4").exists() {
                                fail("expected red.mp4 and blue.mp4 in a fresh Banco fixture directory");
                            }
                        }
                        studio.handle(Msg::Start(StartMsg::Dropped(paths)));
                        if let Some(dir) = &banco {
                            studio.start.location = dir.to_string_lossy().into_owned();
                            studio.start.size = crate::studio::SIZES.len();
                            studio.start.set_manual_frame((320, 180));
                        }
                        studio.handle(Msg::Start(StartMsg::Create));
                        if studio.session.is_some() {
                            Some(Step::Place)
                        } else if !studio.start.error.is_empty() {
                            fail(&format!("making the project failed: {}", studio.start.error));
                        } else {
                            fail("the project was neither made nor refused");
                        }
                    }
                    Step::Place if banco.is_some() => {
                        (studio.project().media.len() == 2).then(|| {
                            // Place by filename, not the order the probe worker finishes.
                            for (name, start) in [("red.mp4", 0.0), ("blue.mp4", 2.0)] {
                                let id = studio.project().media.iter()
                                    .find(|m| m.name == name && m.has_audio)
                                    .unwrap_or_else(|| fail(name)).id.clone();
                                studio.seek(start);
                                studio.media.selected.clear();
                                studio.media.selected.insert(id);
                                studio.handle(Msg::Media(MediaMsg::AddSelectedAtPlayhead));
                            }
                            Step::BancoEdit
                        })
                    }
                    Step::BancoEdit => {
                        drop(studio); // Slint callbacks borrow the studio themselves.
                        banco_edit(shell, &app);
                        step.set(Step::Export);
                        since.set(Instant::now());
                        return;
                    }
                    Step::Place => {
                        let first = studio.project().media.first().map(|item| item.id.clone());
                        first.map(|id| {
                            studio.media.selected.clear();
                            studio.media.selected.insert(id);
                            studio.handle(Msg::Media(MediaMsg::AddSelectedAtPlayhead));
                            Step::Export
                        })
                    }
                    Step::Export => (!studio.timeline().clips.is_empty()).then(|| {
                        studio.handle(Msg::Export(ExportMsg::Open));
                        studio.handle(Msg::Export(ExportMsg::Start));
                        // Left from a run before on the same device.
                        if matches!(
                            studio.confirm,
                            Some(crate::studio::Confirm::ReplaceExport { .. })
                        ) {
                            studio.confirm = None;
                            studio.handle(Msg::Export(ExportMsg::Overwrite));
                        }
                        log::info!("smoke: export started");
                        *began.borrow_mut() = Some(Instant::now());
                        Step::Watch
                    }),
                    Step::Watch => match studio.export.phase {
                        ExportPhase::Done => {
                            let written = studio.export.written.clone();
                            let bytes = std::fs::metadata(&written).map(|meta| meta.len()).ok();
                            let secs = began.borrow().map_or(0.0, |at| at.elapsed().as_secs_f32());
                            match bytes {
                                Some(bytes) if bytes > 0 => {
                                    if let Some(dir) = &banco {
                                        std::fs::copy(&written, dir.join("result.mp4"))
                                            .unwrap_or_else(|e| fail(&format!("copying export: {e}")));
                                    }
                                    log::info!(
                                        "smoke: export finished in {secs:.1} s · {written} · {bytes} bytes"
                                    );
                                    crate::leave(0);
                                }
                                // On a phone the file may have gone on into
                                // the gallery, where no path reaches it.
                                _ if banco.is_none() && (written.is_empty() || cfg!(target_os = "android")) => {
                                    log::info!("smoke: export finished in {secs:.1} s · {written}");
                                    crate::leave(0);
                                }
                                _ => fail(&format!(
                                    "the export said it was done, and {written} is missing or empty"
                                )),
                            }
                        }
                        ExportPhase::Failed => {
                            fail(&format!("the export failed: {}", studio.export.message))
                        }
                        ExportPhase::Idle | ExportPhase::Running => None,
                    },
                };
                match next {
                    Some(next) => {
                        step.set(next);
                        since.set(Instant::now());
                    }
                    None if since.get().elapsed() > STEP_LIMIT => fail(&format!(
                        "waited {} s for {}",
                        STEP_LIMIT.as_secs(),
                        now.waiting_for()
                    )),
                    None => {}
                }
                drop(studio);
                shell.studio.borrow().publish(&app, &shell.models);
            });
        },
    );
    timer
}

/// Drive the same Slint callbacks as the key table and the timeline pointer.
fn banco_edit(shell: &Shell, app: &crate::ui::App) {
    use slint::ComponentHandle;
    let ui = app.global::<crate::ui::Editor>();
    let key = |text: &str| {
        if !ui.invoke_key_chord(text.into(), false, false, false, false, false) {
            fail(&format!("Banco key {text} not handled"));
        }
    };
    let click = |id: &str, additive| {
        ui.invoke_clip_pressed(id.into(), additive, -1);
        ui.invoke_clip_released();
    };
    let layout = |starts: &[f64]| {
        let state = shell.studio.borrow();
        let mut clips = state.timeline().clips.clone();
        clips.sort_by(|a, b| a.start.total_cmp(&b.start));
        if clips.len() != starts.len()
            || clips
                .iter()
                .zip(starts)
                .any(|(c, t)| (c.start - t).abs() > 0.025)
        {
            fail(&format!(
                "expected clip starts {starts:?}, found {:?}",
                clips.iter().map(|c| c.start).collect::<Vec<_>>()
            ));
        }
        clips.iter().map(|c| c.id.clone()).collect::<Vec<_>>()
    };
    let grouped = |wanted: bool| {
        let state = shell.studio.borrow();
        let clips = &state.timeline().clips;
        if clips.len() != 2
            || (wanted && (clips[0].group_id.is_none() || clips[0].group_id != clips[1].group_id))
            || (!wanted && clips.iter().any(|c| c.group_id.is_some()))
        {
            fail(&format!("expected two clips, grouped={wanted}"));
        }
    };
    let ids = layout(&[0.0, 2.0]);
    click(&ids[0], false);
    ui.invoke_seek(1.0);
    key("1");
    let cut = layout(&[0.0, 1.0, 2.0]);
    click(&cut[0], false);
    key("3");
    let ids = layout(&[0.0, 1.0]);
    click(&ids[0], false);
    click(&ids[1], true);
    key("s");
    grouped(true);
    ui.invoke_shortcut("toggle-clip-group".into()); // Banco button's route
    grouped(false);
    app.invoke_app_menu_selected("undo".into());
    grouped(true);
    app.invoke_app_menu_selected("redo".into());
    grouped(false);
    ui.invoke_shortcut("deselect".into());
    click(&ids[0], false);
    click(&ids[1], true);
    key("4");
    grouped(true);
    app.invoke_app_menu_selected("save".into());
    {
        let mut state = shell.studio.borrow_mut();
        let path = state.session.as_ref().unwrap().path().to_owned();
        state.close_project().unwrap_or_else(|e| fail(&e));
        state.open_project_at(&path).unwrap_or_else(|e| fail(&e));
    }
    grouped(true);
    let reopened = layout(&[0.0, 1.0]);
    ui.invoke_clip_pressed(reopened[1].as_str().into(), false, -1);
    if shell.studio.borrow().selection.len() != 2 {
        fail("group selection lost after reopen");
    }
    ui.invoke_clip_dragged(2.0, 0.0);
    ui.invoke_clip_released();
    layout(&[2.0, 3.0]);
    app.invoke_app_menu_selected("undo".into());
    layout(&[0.0, 1.0]);
    log::info!("smoke-banco: cut, ripple, group toggle, history, reopen and group drag passed");
}

/// Ends the run as failed, with the reason in the log.
fn fail(why: &str) -> ! {
    log::error!("smoke: the export run failed: {why}");
    crate::leave(1)
}
