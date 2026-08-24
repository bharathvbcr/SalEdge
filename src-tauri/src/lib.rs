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
    // Explicit escape hatch for support/debugging.
    if let Ok(path) = std::env::var("BSMS_NODE_PATH") {
        return PathBuf::from(path);
    }

    // Bundled sidecar (tauri externalBin) ships next to the main executable;
    // its ABI always matches the better-sqlite3 binding we compiled, unlike
    // whatever Node major the user happens to have installed. Named
    // saledge-node so a deb install can never shadow a system `node`.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let sidecar = dir.join(if cfg!(windows) { "saledge-node.exe" } else { "saledge-node" });
            if sidecar.is_file() {
                return sidecar;
            }
        }
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

fn node_install_hint() -> &'static str {
    if cfg!(target_os = "macos") {
        "Install it with: brew install node (or from https://nodejs.org)"
    } else {
        "Install Node.js 18+ from https://nodejs.org and make sure 'node' is on the system PATH"
    }
}

/// Show a blocking error dialog on every desktop platform. Previously this
/// used osascript only, so on Windows/Linux a failed startup exited silently
/// and the released installer looked dead to end users.
fn show_startup_error(message: &str) {
    eprintln!("[SalEdge] {message}");

    #[cfg(target_os = "macos")]
    {
        let escaped = message.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!(
            r#"display dialog "{escaped}" with title "SalEdge" buttons {{"OK"}} default button "OK" with icon stop"#
        );
        let _ = Command::new("osascript").args(["-e", &script]).status();
    }

    #[cfg(target_os = "windows")]
    {
        // WScript.Shell.Popup survives even before any window exists.
        let escaped = message.replace('\'', "''");
        let script = format!(
            "(New-Object -ComObject WScript.Shell).Popup('{}', 0, 'SalEdge', 16) | Out-Null",
            escaped
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .status();
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        for dialog in [
            Command::new("zenity").args(["--error", "--title=SalEdge", "--text", message]),
            Command::new("kdialog").args(["--error", message, "--title", "SalEdge"]),
        ] {
            if let Ok(mut child) = dialog.spawn() {
                if child.wait().map(|s| s.success()).unwrap_or(false) {
                    return;
                }
            }
        }
    }
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

const MIN_NODE_MAJOR: u32 = 18;

/// Probe `node --version` BEFORE spawning so users get an actionable dialog
/// instead of a cryptic NODE_MODULE_VERSION crash from an ABI-matched bundle.
fn ensure_node_runtime() -> Result<PathBuf, String> {
    let exe = node_executable();
    let output = Command::new(&exe)
        .arg("--version")
        .env("PATH", augmented_path())
        .output()
        .map_err(|e| format!("Node.js was not found ({e}). {}", node_install_hint()))?;
    if !output.status.success() {
        return Err("Node.js exists but could not be executed.".to_string());
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let major: u32 = version
        .trim_start_matches('v')
        .split('.')
        .next()
        .unwrap_or("0")
        .parse()
        .unwrap_or(0);
    if major < MIN_NODE_MAJOR {
        let hint = if cfg!(target_os = "macos") {
            "Upgrade with: brew upgrade node"
        } else {
            "Upgrade Node.js from https://nodejs.org"
        };
        return Err(format!(
            "SalEdge needs Node.js {MIN_NODE_MAJOR}+ but found {version}. {hint}"
        ));
    }
    Ok(exe)
}

fn spawn_api_server(handle: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let node_exe = ensure_node_runtime()?;
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
        let mut cmd = Command::new(node_exe);
        cmd.arg(server_entry);
        cmd
    };
    // The window shell speaks PLAIN HTTP on loopback — the embedded server
    // must not switch to its LAN-HTTPS mode (self-signed cert) or the health
    // probe below can never succeed. All writable state (DB, backups, certs)
    // is redirected out of the signed .app bundle into the user's app-data dir.
    command
        .current_dir(&cwd)
        .env("PATH", augmented_path())
        .env("PORT", port.to_string())
        .env("BSMS_HTTPS", "false")
        // Lets the server provision & persist its own JWT secret in the
        // app-data dir; without this it (correctly) refuses to start.
        .env("BSMS_DESKTOP_MANAGED", "true")
        .env("BSMS_DATA_DIR", data_dir.to_string_lossy().into_owned())
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
    // 120 x 500ms = 60s: first launch on Windows can spend tens of seconds in
    // antivirus scans over the bundled node_modules before Node even binds.
    for _ in 0..120 {
        if check_api_health(port) {
            thread::sleep(Duration::from_millis(300));
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err(format!(
        "API server did not start on port {port} within 60 seconds. {}",
        node_install_hint()
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
                terminate_gracefully(&mut child);
            }
        }
    }
}

/// SIGTERM first (lets the Express shutdown hook run its final backup and WAL
/// checkpoint), then SIGKILL if it refuses to die within the grace period.
fn terminate_gracefully(child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        if libc_kill_term(pid) {
            for _ in 0..40 {
                match child.try_wait() {
                    Ok(Some(_)) => return,
                    Ok(None) => thread::sleep(Duration::from_millis(100)),
                    Err(_) => break,
                }
            }
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(unix)]
fn libc_kill_term(pid: i32) -> bool {
    // Minimal FFI: term(pid, 15). Avoids adding a crate dependency.
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    unsafe { kill(pid, 15) == 0 }
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
                let startup = (|| -> Result<u16, String> {
                    let port = resolve_api_port()?;
                    let child = spawn_api_server(&handle, port)?;
                    // Register the child IMMEDIATELY so any failure path below
                    // can still terminate it — previously a failed health wait
                    // orphaned the Node process holding the preferred port.
                    app.manage(ServerProcess(Mutex::new(Some(child))));
                    wait_for_api_server(port)?;
                    open_main_window(&handle, port)?;
                    Ok(port)
                })();

                match startup {
                    Ok(_port) => {}
                    Err(error) => {
                        stop_api_server(&handle);
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
        match event {
            RunEvent::Exit => stop_api_server(&handle),
            // macOS dock-click / `open -a` while already running: the main
            // window starts life hidden and is only shown after the API
            // server is healthy, so a reopen event that arrives before (or
            // instead of) that first show left users staring at nothing.
            RunEvent::Reopen { .. } => {
                if let Some(window) = _app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        }
    });
}
