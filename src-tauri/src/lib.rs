use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{Manager, RunEvent, Url};

const PREFERRED_API_PORT: u16 = 13001;

struct ServerProcess(Mutex<Option<Child>>);

fn node_executable() -> PathBuf {
    if let Ok(path) = std::env::var("BSMS_NODE_PATH") {
        return PathBuf::from(path);
    }

    for candidate in [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ] {
        let path = Path::new(candidate);
        if path.is_file() {
            return path.to_path_buf();
        }
    }

    PathBuf::from("node")
}

fn augmented_path() -> String {
    let existing = std::env::var("PATH").unwrap_or_default();
    format!("/opt/homebrew/bin:/usr/local/bin:{existing}")
}

fn show_startup_error(message: &str) {
    let escaped = message.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        r#"display dialog "{escaped}" with title "Battery Shop Management System" buttons {{"OK"}} default button "OK" with icon stop"#
    );
    let _ = Command::new("osascript").args(["-e", &script]).status();
}

fn app_dir(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
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

fn port_in_use(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{port}")).is_ok()
}

fn find_available_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Failed to find an open port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    Ok(port)
}

fn resolve_api_port() -> Result<u16, String> {
    if !port_in_use(PREFERRED_API_PORT) {
        return Ok(PREFERRED_API_PORT);
    }

    if check_api_health(PREFERRED_API_PORT) {
        return Ok(PREFERRED_API_PORT);
    }

    find_available_port()
}

fn check_api_health(port: u16) -> bool {
    use std::io::{Read, Write};

    let Ok(mut stream) = std::net::TcpStream::connect(format!("127.0.0.1:{port}")) else {
        return false;
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    response.contains("sqlite")
}

fn spawn_api_server(handle: &tauri::AppHandle, port: u16) -> Result<Child, String> {
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
        let mut cmd = Command::new(node_executable());
        cmd.arg(server_entry);
        cmd
    };

    command
        .current_dir(&cwd)
        .env("PATH", augmented_path())
        .env("PORT", port.to_string())
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

fn wait_for_api_server(port: u16) -> Result<(), String> {
    for _ in 0..60 {
        if check_api_health(port) {
            thread::sleep(Duration::from_millis(300));
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err(format!(
        "API server did not start on port {port} within 30 seconds. Ensure Node.js is installed (brew install node)."
    ))
}

fn open_main_window(handle: &tauri::AppHandle, port: u16) -> Result<(), String> {
    let window = handle
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    let url = Url::parse(&format!("http://127.0.0.1:{port}"))
        .map_err(|e| format!("Invalid app URL: {e}"))?;
    window
        .navigate(url)
        .map_err(|e| format!("Failed to open app UI: {e}"))?;
    window
        .show()
        .map_err(|e| format!("Failed to show main window: {e}"))?;
    Ok(())
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
    let build_result = tauri::Builder::default()
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
                let startup = (|| -> Result<(Child, u16), String> {
                    let port = resolve_api_port()?;
                    let child = spawn_api_server(&handle, port)?;
                    wait_for_api_server(port)?;
                    open_main_window(&handle, port)?;
                    Ok((child, port))
                })();

                match startup {
                    Ok((child, _port)) => {
                        app.manage(ServerProcess(Mutex::new(Some(child))));
                    }
                    Err(error) => {
                        show_startup_error(&error);
                        std::process::exit(1);
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!());

    // Avoid .expect() here: a panic on this path can cross a non-unwinding
    // extern "C" callback boundary on macOS and hard-abort instead of
    // surfacing this message to the user.
    let app = match build_result {
        Ok(app) => app,
        Err(error) => {
            show_startup_error(&format!("Failed to start application: {error}"));
            std::process::exit(1);
        }
    };

    let handle = app.handle().clone();
    app.run(move |_app_handle, event| {
        if let RunEvent::Exit = event {
            stop_api_server(&handle);
        }
    });
}
