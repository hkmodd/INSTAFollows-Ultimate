//! INSTAFollows Ultimate - Tauri Application Entry
//! 
//! Commands for the frontend to interact with the Ghost Client

mod network;

use network::{get_stealth_integrity, GhostClient, Profile, ScanResult};
use tauri::State;
use tokio::sync::Mutex;

// ============================================
// APPLICATION STATE
// ============================================

struct AppState {
    client: Mutex<GhostClient>,
}

// ============================================
// TAURI COMMANDS
// ============================================

/// Load session from cookies.json
#[tauri::command]
async fn load_session(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let mut client = state.client.lock().await;
    client.load_session(&path).map_err(|e| e.to_string())
}

/// Warmup connection (establish Keep-Alive)
#[tauri::command]
async fn warmup_connection(state: State<'_, AppState>) -> Result<(), String> {
    let client = state.client.lock().await;
    client.warmup().await.map_err(|e| e.to_string())
}

/// Get user ID from username
#[tauri::command]
async fn get_user_id(state: State<'_, AppState>, username: String) -> Result<String, String> {
    let client = state.client.lock().await;
    client.get_user_id(&username).await.map_err(|e| e.to_string())
}

/// Scan for traitors (people you follow who don't follow back)
#[tauri::command]
async fn scan_traitors(state: State<'_, AppState>, window: tauri::Window, user_id: String) -> Result<ScanResult, String> {
    let client = state.client.lock().await;
    client.find_traitors(&user_id, &window).await.map_err(|e| e.to_string())
}

/// Fetch followers list
#[tauri::command]
async fn fetch_followers(state: State<'_, AppState>, window: tauri::Window, user_id: String) -> Result<Vec<Profile>, String> {
    let client = state.client.lock().await;
    client.fetch_followers(&user_id, &window).await.map_err(|e| e.to_string())
}

/// Fetch following list
#[tauri::command]
async fn fetch_following(state: State<'_, AppState>, window: tauri::Window, user_id: String) -> Result<Vec<Profile>, String> {
    let client = state.client.lock().await;
    client.fetch_following(&user_id, &window).await.map_err(|e| e.to_string())
}

/// Get current stealth integrity percentage
#[tauri::command]
fn get_integrity() -> u8 {
    get_stealth_integrity()
}

/// Get logged-in user ID
#[tauri::command]
async fn get_logged_user_id(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let client = state.client.lock().await;
    Ok(client.user_id.clone())
}

/// Unfollow a user
#[tauri::command]
async fn unfollow_user(state: State<'_, AppState>, user_id: String) -> Result<bool, String> {
    let client = state.client.lock().await;
    client.unfollow_user(&user_id).await.map_err(|e| e.to_string())
}

/// Proxy profile picture (returns base64 data URL)
#[tauri::command]
async fn proxy_pic(state: State<'_, AppState>, url: String) -> Result<String, String> {
    let client = state.client.lock().await;
    client.proxy_profile_pic(&url).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_current_user(state: State<'_, AppState>) -> Result<Profile, String> {
    state.client.lock().await.fetch_current_user().await.map_err(|e| e.to_string())
}

// ============================================
// APPLICATION ENTRY
// ============================================

#[tauri::command]
async fn restore_session(state: State<'_, AppState>) -> Result<String, String> {
    state.client.lock().await.restore_session().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            client: Mutex::new(GhostClient::new().expect("Failed to create GhostClient")),
        })
        .invoke_handler(tauri::generate_handler![
            load_session,
            restore_session,
            warmup_connection,
            get_user_id,
            scan_traitors,
            fetch_followers,
            fetch_following,
            get_integrity,
            get_logged_user_id,
            unfollow_user,
            proxy_pic,
            get_current_user
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

