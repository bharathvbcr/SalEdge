use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{Manager, RunEvent};

const API_PORT: u16 = 3001;

struct ServerProcess(Mutex<Option<Child>>);

fn app_dir(handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    if cfg!(debug_assertions) {
        std::env::current_dir().map_err(|e| e.to_string())
    } else {
        Ok(handle
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("app"))
    }
}

fn spawn_api_server(handle: &tauri::AppHandle) -> Result<Child, String> {
    let cwd = app_dir(handle)?;
    let data_dir = handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let db_path = data_dir.join("bsms.sqlite");
    let server_entry = if cfg!(debug_assertions) {
        cwd.join("server/index.ts")
    } else {
        cwd.join("dist-server/index.mjs")
    };

    let mut command = if cfg!(debug_assertions) {
        let mut cmd = Command::new("npx");
        cmd.args(["tsx", server_entry.to_str().unwrap_or("server/index.ts")]);
        cmd
    } else {
        let mut cmd = Command::new("node");
        cmd.arg(server_entry);
        cmd
    };

    command
        .current_dir(&cwd)
        .env("PORT", API_PORT.to_string())
        .env(
            "DATABASE_PATH",
            db_path.to_string_lossy().into_owned(),
        );

    command.spawn().map_err(|e| {
        format!(
            "Failed to start API server (is Node.js installed?): {e}"
        )
    })
}

fn wait_for_api_server() -> Result<(), String> {
    let address = format!("127.0.0.1:{API_PORT}");
    for _ in 0..60 {
        if std::net::TcpStream::connect(&address).is_ok() {
            thread::sleep(Duration::from_millis(300));
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err(format!(
        "API server did not start on port {API_PORT} within 30 seconds"
    ))
}

fn stop_api_server(handle: &tauri::AppHandle) {
    if let Some(state) = handle.try_state::<ServerProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // In dev, beforeDevCommand already starts the API server.
            if !cfg!(debug_assertions) {
                let handle = app.handle().clone();
                let child = spawn_api_server(&handle)?;
                wait_for_api_server()?;
                app.manage(ServerProcess(Mutex::new(Some(child))));
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let handle = app.handle().clone();
    app.run(move |_app_handle, event| {
        if let RunEvent::Exit = event {
            stop_api_server(&handle);
        }
    });
}
