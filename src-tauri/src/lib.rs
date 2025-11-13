use tauri::Manager;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// API响应结构
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<serde_json::Value>,
}

// Tauri命令：获取Jupyter状态
#[tauri::command]
async fn get_jupyter_status() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://127.0.0.1:5000/api/status")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(json)
}

// Tauri命令：启动Jupyter
#[tauri::command]
async fn start_jupyter(config: serde_json::Value) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:5000/api/start")
        .json(&config)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(json)
}

// Tauri命令：停止Jupyter
#[tauri::command]
async fn stop_jupyter() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:5000/api/stop")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(json)
}

// Tauri命令：重启Jupyter
#[tauri::command]
async fn restart_jupyter() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:5000/api/restart")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(json)
}

// Tauri命令：检测Python环境
#[tauri::command]
async fn detect_python() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://127.0.0.1:5000/api/detect_python")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(json)
}

// Tauri命令：保存配置
#[tauri::command]
async fn save_config(config: serde_json::Value) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:5000/api/save_config")
        .json(&config)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(json)
}

// Tauri命令：加载配置
#[tauri::command]
async fn load_config() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://127.0.0.1:5000/api/load_config")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(json)
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
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        get_jupyter_status,
        start_jupyter,
        stop_jupyter,
        restart_jupyter,
        detect_python,
        save_config,
        load_config
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
