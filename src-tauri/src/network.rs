//! # INSTAFollows Ultimate - Stealth Network Layer
//! 
//! The "Doppelgänger" Client: Uses rquest with Chrome133 TLS fingerprinting
//! to bypass Instagram's Botguard detection.

use anyhow::{anyhow, Result};
use rquest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, CONTENT_TYPE, ORIGIN, REFERER, USER_AGENT};
use rquest::{Client, Impersonate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs::File;
use std::io::BufReader;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;
use tokio::time::sleep;
use url::Url;
use tauri::Emitter;

// ============================================
// CONSTANTS
// ============================================

const API_DOMAIN: &str = "www.instagram.com";
const WEB_APP_ID: &str = "936619743392459";

// GraphQL Query Hashes (may change - update if Instagram modifies them)
const FOLLOWERS_HASH: &str = "c76146de99bb02f6415203be841dd25a";
const FOLLOWING_HASH: &str = "d04b0a864b4b54837c0d870b0e77e076";

// ============================================
// DATA STRUCTURES
// ============================================

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Profile {
    pub id: String,
    pub username: String,
    pub full_name: String,
    pub profile_pic_url: String,
    pub profile_pic_url_hd: Option<String>,
    pub is_verified: bool,
    pub is_private: bool,
    pub is_business_account: bool,
    pub is_professional_account: bool,
    pub category_name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CookieItem {
    pub name: String,
    pub value: String,
    pub domain: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ScanResult {
    pub traitors: Vec<Profile>,
    pub total_followers: u32,
    pub total_following: u32,
    pub scan_time_ms: u64,
}

// ============================================
// STEALTH INTEGRITY TRACKER
// ============================================

static PROFILES_SCANNED: AtomicU32 = AtomicU32::new(0);
static LAST_SCAN_TIME: AtomicU32 = AtomicU32::new(0);

pub fn get_stealth_integrity() -> u8 {
    let scanned = PROFILES_SCANNED.load(Ordering::Relaxed);
    let penalty = (scanned / 100) * 5; // 5% per 100 profiles
    
    // Regeneration: +1% per minute of idle time (simplified)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as u32;
    let last = LAST_SCAN_TIME.load(Ordering::Relaxed);
    let idle_minutes = if last > 0 { (now - last) / 60 } else { 0 };
    let regen = idle_minutes.min(100) as u8;
    
    let integrity = 100u8.saturating_sub(penalty as u8).saturating_add(regen);
    integrity.min(100)
}

pub fn record_scan(count: u32) {
    PROFILES_SCANNED.fetch_add(count, Ordering::Relaxed);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as u32;
    LAST_SCAN_TIME.store(now, Ordering::Relaxed);
}

// ============================================
// GHOST CLIENT - Chrome133 Impersonation
// ============================================

pub struct GhostClient {
    client: Client,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub csrf_token: Option<String>,
    cookies_loaded: bool,
}

impl GhostClient {
    pub fn new() -> Result<Self> {
        // Build rquest client with Chrome133 TLS fingerprint
        let client = Client::builder()
            .impersonate(Impersonate::Chrome133)
            .cookie_store(true)
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| anyhow!("Failed to build Ghost Client: {}", e))?;

        Ok(GhostClient {
            client,
            user_id: None,
            username: None,
            csrf_token: None,
            cookies_loaded: false,
        })
    }

    fn get_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            ),
        );
        headers.insert(ACCEPT, HeaderValue::from_static("*/*"));
        headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
        headers.insert("X-IG-App-ID", HeaderValue::from_static(WEB_APP_ID));
        headers.insert("X-Requested-With", HeaderValue::from_static("XMLHttpRequest"));
        headers.insert("X-ASBD-ID", HeaderValue::from_static("129477"));
        headers.insert(
            ORIGIN,
            HeaderValue::from_str(&format!("https://{}", API_DOMAIN)).unwrap(),
        );
        headers.insert(
            REFERER,
            HeaderValue::from_str(&format!("https://{}/", API_DOMAIN)).unwrap(),
        );
        headers.insert("Sec-Fetch-Dest", HeaderValue::from_static("empty"));
        headers.insert("Sec-Fetch-Mode", HeaderValue::from_static("cors"));
        headers.insert("Sec-Fetch-Site", HeaderValue::from_static("same-origin"));

        if let Some(ref token) = self.csrf_token {
            if let Ok(val) = HeaderValue::from_str(token) {
                headers.insert("X-CSRFToken", val);
            }
        }

        headers
    }

    /// Load session from cookies.json exported from browser
    pub fn load_session(&mut self, file_path: &str) -> Result<String> {
        let file = File::open(file_path)?;
        let reader = BufReader::new(file);
        let cookies: Vec<CookieItem> = serde_json::from_reader(reader)?;

        // INTERNAL PERSISTENCE: Save a copy to the app directory
        // This allows restoring the session even if the original file is moved/deleted.
        if let Ok(json) = serde_json::to_string(&cookies) {
            let _ = std::fs::write("instafollows_session.json", json);
        }

        let url = Url::parse(&format!("https://{}", API_DOMAIN))?;
        let mut found_session = false;
        let mut found_csrf = false;
        
        // Collect all cookies as HeaderValues
        let mut cookie_headers: Vec<HeaderValue> = Vec::new();

        for cookie in &cookies {
            let cookie_str = format!(
                "{}={}",
                cookie.name,
                cookie.value
            );
            if let Ok(header_val) = HeaderValue::from_str(&cookie_str) {
                cookie_headers.push(header_val);
            }

            if cookie.name == "sessionid" {
                self.user_id = Some(cookie.value.split('%').next().unwrap_or("").to_string());
                found_session = true;
            }
            if cookie.name == "csrftoken" {
                self.csrf_token = Some(cookie.value.clone());
                found_csrf = true;
            }
            if cookie.name == "ds_user" {
                self.username = Some(cookie.value.clone());
            }
        }
        
        // Set all cookies at once
        self.client.set_cookies(&url, &cookie_headers);

        if found_session && found_csrf {
            self.cookies_loaded = true;
            Ok(format!(
                "Session loaded. User ID: {}",
                self.user_id.as_deref().unwrap_or("unknown")
            ))
        } else {
            Err(anyhow!(
                "Invalid cookies.json: Missing sessionid or csrftoken"
            ))
        }
    }

    /// Try to restore session from internal storage
    pub fn restore_session(&mut self) -> Result<String> {
        if std::path::Path::new("instafollows_session.json").exists() {
            self.load_session("instafollows_session.json")
        } else {
             Err(anyhow!("No saved session found"))
        }
    }

    /// Warmup connection to establish Keep-Alive
    pub async fn warmup(&self) -> Result<()> {
        let url = format!("https://{}/", API_DOMAIN);
        let _ = self.client.get(&url).headers(self.get_headers()).send().await;
        Ok(())
    }

    /// Adaptive delay between requests (1-2.5 seconds) - Optimized for speed
    async fn stealth_delay(&self) {
        use rand::Rng;
        let delay = rand::rng().random_range(1000..2500);
        sleep(Duration::from_millis(delay)).await;
    }

    /// Fetch user ID from username
    pub async fn get_user_id(&self, username: &str) -> Result<String> {
        let url = format!("https://{}/api/v1/users/web_profile_info/", API_DOMAIN);
        
        let resp = self
            .client
            .get(&url)
            .headers(self.get_headers())
            .query(&[("username", username)])
            .send()
            .await?;

        let json: Value = resp.json().await?;
        
        json["data"]["user"]["id"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow!("User not found: {}", username))
    }

    /// Fetch current logged-in user profile
    pub async fn fetch_current_user(&self) -> Result<Profile> {
        // 1. Try to get Username from cached cookie or Edit Account Data
        let username = if let Some(ref u) = self.username {
            u.clone()
        } else {
            let url = format!("https://{}/api/v1/accounts/edit/web_form_data/", API_DOMAIN);
            let resp = self.client.get(&url).headers(self.get_headers()).send().await?;
            let json: Value = resp.json().await?;
            
            json["form_data"]["username"]
                .as_str()
                .ok_or_else(|| anyhow!("Failed to fetch current username"))?
                .to_string()
        };

        // 2. Get full profile info using Web Profile Info
        // We manually call the profile info endpoint to get the Profile struct
        let info_url = format!("https://{}/api/v1/users/web_profile_info/", API_DOMAIN);
        let info_resp = self.client
            .get(&info_url)
            .headers(self.get_headers())
            .query(&[("username", &username)])
            .send()
            .await?;
            
        let info_json: Value = info_resp.json().await?;
        let user_data = &info_json["data"]["user"];
        
        Ok(Profile {
            id: user_data["id"].as_str().unwrap_or("").to_string(),
            username: user_data["username"].as_str().unwrap_or("").to_string(),
            full_name: user_data["full_name"].as_str().unwrap_or("").to_string(),
            profile_pic_url: user_data["profile_pic_url"].as_str().unwrap_or("").to_string(),
            profile_pic_url_hd: user_data["profile_pic_url_hd"].as_str().map(|s| s.to_string()),
            is_verified: user_data["is_verified"].as_bool().unwrap_or(false),
            is_private: user_data["is_private"].as_bool().unwrap_or(false),
            is_business_account: user_data["is_business_account"].as_bool().unwrap_or(false),
            is_professional_account: user_data["is_professional_account"].as_bool().unwrap_or(false),
            category_name: user_data["category_name"].as_str().map(|s| s.to_string()),
        })
    }

    /// Fetch followers using GraphQL pagination
    pub async fn fetch_followers(&self, user_id: &str, window: &tauri::Window) -> Result<Vec<Profile>> {
        self.fetch_connections(user_id, FOLLOWERS_HASH, "edge_followed_by", window, "followers").await
    }

    /// Fetch following using GraphQL pagination
    pub async fn fetch_following(&self, user_id: &str, window: &tauri::Window) -> Result<Vec<Profile>> {
        self.fetch_connections(user_id, FOLLOWING_HASH, "edge_follow", window, "following").await
    }

    /// Generic connection fetcher with pagination and progress reporting
    async fn fetch_connections(
        &self,
        user_id: &str,
        query_hash: &str,
        edge_name: &str,
        window: &tauri::Window,
        stage: &str,
    ) -> Result<Vec<Profile>> {
        let mut profiles = Vec::new();
        let mut cursor: Option<String> = None;
        let mut has_next = true;
        let mut total_count = 0;

        while has_next {
            let mut variables = serde_json::json!({
                "id": user_id,
                "first": 50,
            });

            if let Some(c) = &cursor {
                variables["after"] = c.clone().into();
            }

            let url = format!("https://{}/graphql/query", API_DOMAIN);
            
            let resp = self
                .client
                .get(&url)
                .headers(self.get_headers())
                .query(&[
                    ("query_hash", query_hash),
                    ("variables", &variables.to_string()),
                ])
                .send()
                .await?;

            let json: Value = resp.json().await?;

            // Parse response
            let edge_data = &json["data"]["user"][edge_name];
            
            // Get total count on first iteration
            if total_count == 0 {
                total_count = edge_data["count"].as_u64().unwrap_or(0) as usize;
            }

            if let Some(edges) = edge_data["edges"].as_array() {
                for edge in edges {
                    let node = &edge["node"];
                    profiles.push(Profile {
                        id: node["id"].as_str().unwrap_or("").to_string(),
                        username: node["username"].as_str().unwrap_or("").to_string(),
                        full_name: node["full_name"].as_str().unwrap_or("").to_string(),
                        profile_pic_url: node["profile_pic_url"].as_str().unwrap_or("").to_string(),
                        profile_pic_url_hd: node["profile_pic_url_hd"].as_str().map(|s| s.to_string()),
                        is_verified: node["is_verified"].as_bool().unwrap_or(false),
                        is_private: node["is_private"].as_bool().unwrap_or(false),
                        is_business_account: node["is_business_account"].as_bool().unwrap_or(false),
                        is_professional_account: node["is_professional_account"].as_bool().unwrap_or(false),
                        category_name: node["category_name"].as_str().map(|s| s.to_string()),
                    });
                }
            }

            // Emit Progress Event
            let _ = window.emit("scan_progress", serde_json::json!({
                "stage": stage,
                "current": profiles.len(),
                "total": total_count
            }));

            // Pagination
            let page_info = &edge_data["page_info"];
            has_next = page_info["has_next_page"].as_bool().unwrap_or(false);
            cursor = page_info["end_cursor"].as_str().map(|s| s.to_string());

            // Record scan for integrity tracking
            record_scan(50);

            // Stealth delay between pages
            if has_next {
                self.stealth_delay().await;
            }
        }

        Ok(profiles)
    }

    /// Complete Traitor Scan
    pub async fn find_traitors(&self, user_id: &str, window: &tauri::Window) -> Result<ScanResult> {
        let start = std::time::Instant::now();

        // Fetch both lists
        let followers = self.fetch_followers(user_id, window).await?;
        let following = self.fetch_following(user_id, window).await?;

        // Create set of follower IDs for O(1) lookup
        let follower_ids: HashSet<String> = followers.iter().map(|p| p.id.clone()).collect();

        // Find traitors: following but not in followers
        let traitors: Vec<Profile> = following
            .iter()
            .filter(|p| !follower_ids.contains(&p.id))
            .cloned()
            .collect();

        let scan_time_ms = start.elapsed().as_millis() as u64;

        Ok(ScanResult {
            traitors,
            total_followers: followers.len() as u32,
            total_following: following.len() as u32,
            scan_time_ms,
        })
    }

    /// Unfollow a user
    pub async fn unfollow_user(&self, target_user_id: &str) -> Result<bool> {
        if !self.cookies_loaded {
            return Err(anyhow!("Session not loaded"));
        }

        let url = format!(
            "https://{}/api/v1/friendships/destroy/{}/",
            API_DOMAIN, target_user_id
        );

        let mut headers = self.get_headers();
        if let Some(csrf) = &self.csrf_token {
            headers.insert("X-CSRFToken", HeaderValue::from_str(csrf).unwrap());
        }

        // Stealth delay before action
        self.stealth_delay().await;

        let params = [("user_id", target_user_id)];

        let resp = self
            .client
            .post(&url)
            .headers(headers)
            .form(&params)
            .send()
            .await?;

        let status = resp.status();
        if status.is_success() {
            log::info!("Unfollowed user {}", target_user_id);
            Ok(true)
        } else {
            let text = resp.text().await.unwrap_or_default();
            log::error!("Unfollow failed: {} - {}", status, text);
            Err(anyhow!("Unfollow failed: {}", status))
        }
    }

    /// Proxy profile picture to avoid CORS issues, returns base64 data URL
    pub async fn proxy_profile_pic(&self, pic_url: &str) -> Result<String> {
        use rquest::header::ACCEPT;
        
        // Build a simple request to fetch the image
        let resp = self
            .client
            .get(pic_url)
            .header(ACCEPT, "image/webp,image/avif,image/*,*/*;q=0.8")
            .header("Referer", format!("https://{}/", API_DOMAIN))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(anyhow!("Failed to fetch image: {}", resp.status()));
        }

        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_string();

        let bytes = resp.bytes().await?;
        
        // Convert to base64 data URL
        use base64::{Engine, engine::general_purpose};
        let b64 = general_purpose::STANDARD.encode(&bytes);
        let data_url = format!("data:{};base64,{}", content_type, b64);

        Ok(data_url)
    }
}

impl Default for GhostClient {
    fn default() -> Self {
        Self::new().expect("Failed to create default GhostClient")
    }
}

