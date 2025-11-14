use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Manager, State};

/// 应用状态
#[derive(Debug, Default)]
pub struct AppState {
    pub jupyter_status: std::sync::Mutex<JupyterStatus>,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Jupyter 状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JupyterStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub pid: Option<u32>,
    pub url: Option<String>,
    pub uptime: u64,
}

impl Default for JupyterStatus {
    fn default() -> Self {
        Self {
            running: false,
            port: None,
            pid: None,
            url: None,
            uptime: 0,
        }
    }
}

/// Python 环境检测结果
#[derive(Debug, Serialize)]
pub struct PythonInfo {
    pub python_version: String,
    pub python_executable: String,
    pub platform: String,
    pub jupyterlab_installed: bool,
    pub jupyterlab_version: Option<String>,
    pub jupyter_notebook_installed: bool,
    pub jupyter_notebook_version: Option<String>,
}

/// 配置数据
#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub jupyter_port: u16,
    pub python_executable: Option<String>,
    pub project_dir: Option<String>,
    pub use_notebook: bool,
    pub auto_start: bool,
    pub auto_restart: bool,
    pub check_interval: u32,
    pub max_restarts: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            jupyter_port: 8888,
            python_executable: None,
            project_dir: None,
            use_notebook: false,
            auto_start: false,
            auto_restart: true,
            check_interval: 2000,
            max_restarts: 3,
        }
    }
}

/// 检测 Python 环境
#[tauri::command]
pub async fn detect_python() -> Result<PythonInfo, String> {
    log::info!("Detecting Python environment...");

    match detect_python_environment().await {
        Ok(info) => {
            log::info!("Python environment detected successfully");
            Ok(info)
        }
        Err(e) => {
            log::error!("Failed to detect Python environment: {}", e);
            Err(format!("检测 Python 环境失败: {}", e))
        }
    }
}

/// 获取 Jupyter 状态（通过 API 代理）
#[tauri::command]
pub async fn get_jupyter_status() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://127.0.0.1:5000/api/status")
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("请求 API 失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API 返回错误状态: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 API 响应失败: {}", e))?;

    Ok(json)
}

/// 启动 Jupyter（通过 API 代理）
#[tauri::command]
pub async fn start_jupyter(config: serde_json::Value) -> Result<serde_json::Value, String> {
    log::info!("Starting Jupyter with config: {}", config);

    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:5000/api/start")
        .timeout(std::time::Duration::from_secs(30))
        .json(&config)
        .send()
        .await
        .map_err(|e| format!("请求 API 失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API 返回错误状态: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 API 响应失败: {}", e))?;

    Ok(json)
}

/// 停止 Jupyter（通过 API 代理）
#[tauri::command]
pub async fn stop_jupyter() -> Result<serde_json::Value, String> {
    log::info!("Stopping Jupyter...");

    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:5000/api/stop")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("请求 API 失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API 返回错误状态: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 API 响应失败: {}", e))?;

    Ok(json)
}

/// 重启 Jupyter（通过 API 代理）
#[tauri::command]
pub async fn restart_jupyter() -> Result<serde_json::Value, String> {
    log::info!("Restarting Jupyter...");

    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:5000/api/restart")
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("请求 API 失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API 返回错误状态: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 API 响应失败: {}", e))?;

    Ok(json)
}

/// 保存配置（通过 API 代理）
#[tauri::command]
pub async fn save_config(config: serde_json::Value) -> Result<serde_json::Value, String> {
    log::info!("Saving configuration...");

    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:5000/api/save_config")
        .timeout(std::time::Duration::from_secs(5))
        .json(&config)
        .send()
        .await
        .map_err(|e| format!("请求 API 失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API 返回错误状态: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 API 响应失败: {}", e))?;

    Ok(json)
}

/// 加载配置（通过 API 代理）
#[tauri::command]
pub async fn load_config() -> Result<serde_json::Value, String> {
    log::info!("Loading configuration...");

    let client = reqwest::Client::new();
    let response = client
        .get("http://127.0.0.1:5000/api/load_config")
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("请求 API 失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API 返回错误状态: {}", response.status()));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 API 响应失败: {}", e))?;

    Ok(json)
}

/// 打开文件对话框
#[tauri::command]
pub async fn open_file_dialog() -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // 这里应该使用文件对话框插件，现在返回默认路径
    let file_path = std::env::current_dir()
        .unwrap()
        .join("web_app.py");

    if file_path.exists() {
        Ok(Some(file_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// 打开文件夹对话框
#[tauri::command]
pub async fn open_folder_dialog() -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // 返回当前目录作为示例
    let current_dir = std::env::current_dir().unwrap();
    Ok(Some(current_dir.to_string_lossy().to_string()))
}

/// 获取系统信息
#[tauri::command]
pub async fn get_system_info() -> Result<serde_json::Value, String> {
    let info = serde_json::json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "family": std::env::consts::FAMILY,
        "version": env!("CARGO_PKG_VERSION"),
        "name": env!("CARGO_PKG_NAME")
    });

    Ok(info)
}

/// 打开 URL
#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    log::info!("Opening URL: {}", url);

    match open::that(&url) {
        Ok(()) => Ok(()),
        Err(e) => Err(format!("打开 URL 失败: {}", e))
    }
}

/// 显示通知
#[tauri::command]
pub async fn show_notification(title: String, body: String) -> Result<(), String> {
    log::info!("Showing notification: {} - {}", title, body);

    // 在实际应用中，这里应该使用系统通知
    // 现在只是记录日志
    Ok(())
}

/// 实际的 Python 环境检测实现
async fn detect_python_environment() -> Result<PythonInfo, Box<dyn std::error::Error>> {
    use std::process::Command;

    let output = Command::new("python")
        .args(&["-c", "import sys; import platform; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}'); print(sys.executable); print(platform.platform())"])
        .output()?;

    let output_str = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = output_str.lines().collect();

    let python_version = lines.get(0).unwrap_or(&"unknown").to_string();
    let python_executable = lines.get(1).unwrap_or(&"unknown").to_string();
    let platform = lines.get(2).unwrap_or(&"unknown").to_string();

    // 检查 JupyterLab
    let jupyterlab_output = Command::new("python")
        .args(&["-c", "import jupyterlab; print(jupyterlab.__version__)"])
        .output();

    let (jupyterlab_installed, jupyterlab_version) = match jupyterlab_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, Some(version))
        }
        _ => (false, None),
    };

    // 检查 Jupyter Notebook
    let notebook_output = Command::new("python")
        .args(&["-c", "import notebook; print(notebook.__version__)"])
        .output();

    let (jupyter_notebook_installed, jupyter_notebook_version) = match notebook_output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, Some(version))
        }
        _ => (false, None),
    };

    Ok(PythonInfo {
        python_version,
        python_executable,
        platform,
        jupyterlab_installed,
        jupyterlab_version,
        jupyter_notebook_installed,
        jupyter_notebook_version,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 初始化应用状态
      app.manage(AppState::new());

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        detect_python,
        get_jupyter_status,
        start_jupyter,
        stop_jupyter,
        restart_jupyter,
        save_config,
        load_config,
        open_file_dialog,
        open_folder_dialog,
        get_system_info,
        open_url,
        show_notification
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
