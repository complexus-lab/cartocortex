use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_fs::FsExt;

/// File types the app registers for (see `bundle.fileAssociations` in tauri.conf.json); the arguments of a launch are filtered by them.
const OPENABLE: [&str; 1] = ["xmind"];

/// Files the system asked us to open. Until the page has called `take_pending_opens` it cannot listen yet, so they wait here.
#[derive(Default)]
struct Opens {
    ready: bool,
    pending: Vec<String>,
}

fn openable(path: &PathBuf) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|e| e.to_str())
            .map_or(false, |e| OPENABLE.contains(&e.to_ascii_lowercase().as_str()))
}

/// Windows and Linux pass the file to open as a command-line argument.
fn paths_from_args(args: impl Iterator<Item = String>) -> Vec<PathBuf> {
    args.filter(|a| !a.starts_with('-')).map(PathBuf::from).filter(openable).collect()
}

/// Let the page read the files and tell it about them: now if it is listening, otherwise when it asks.
fn deliver(app: &AppHandle, paths: Vec<PathBuf>) {
    let state = app.state::<Mutex<Opens>>();
    for path in paths.into_iter().filter(openable) {
        // A file the user double-clicked is outside the scope granted to dialog picks, so allow it explicitly.
        if app.fs_scope().allow_file(&path).is_err() {
            continue;
        }
        let path = path.to_string_lossy().into_owned();
        let mut opens = state.lock().unwrap();
        if opens.ready {
            let _ = app.emit("open-file", path);
        } else {
            opens.pending.push(path);
        }
    }
}

/// Called once by the page when it listens: returns what arrived before, and switches to live events.
#[tauri::command]
fn take_pending_opens(state: tauri::State<Mutex<Opens>>) -> Vec<String> {
    let mut opens = state.lock().unwrap();
    opens.ready = true;
    std::mem::take(&mut opens.pending)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init()) // keeps access to files picked in dialogs across restarts (recent files)
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(Opens::default()))
        .invoke_handler(tauri::generate_handler![take_pending_opens])
        .setup(|app| {
            deliver(app.handle(), paths_from_args(std::env::args().skip(1)));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app, _event| {
        // macOS hands double-clicked files to the running app as an event, not as arguments.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = _event {
            deliver(_app, urls.iter().filter_map(|u| u.to_file_path().ok()).collect());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_existing_xmind_files_are_taken_from_arguments() {
        let dir = std::env::temp_dir().join(format!("cartocortex-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (map, upper, other) = (dir.join("a.xmind"), dir.join("B.XMIND"), dir.join("c.txt"));
        for f in [&map, &upper, &other] {
            std::fs::write(f, "x").unwrap();
        }
        let args = [
            "--flag".to_string(),
            map.to_string_lossy().into_owned(),
            upper.to_string_lossy().into_owned(),
            other.to_string_lossy().into_owned(),
            dir.join("missing.xmind").to_string_lossy().into_owned(),
        ];
        assert_eq!(paths_from_args(args.into_iter()), vec![map, upper]);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
