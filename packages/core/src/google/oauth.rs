//! OAuth 2.0 for Google: PKCE, the authorization URL, code exchange, token
//! refresh, revocation and the userinfo lookup.
//!
//! Implements the flows from
//! <https://developers.google.com/identity/protocols/oauth2/native-app> and
//! <https://developers.google.com/identity/protocols/oauth2/web-server>.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use url::Url;

use super::{GoogleConfig, SCOPES};
use crate::error::CoreError;

/// PKCE (RFC 7636) code verifier + S256 challenge. Generated per
/// authorization request; the verifier never leaves this process.
#[derive(Debug, Clone)]
pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

impl Pkce {
    pub fn generate() -> Self {
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        let verifier = URL_SAFE_NO_PAD.encode(bytes);
        Self::from_verifier(verifier)
    }

    fn from_verifier(verifier: String) -> Self {
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        Self { verifier, challenge }
    }
}

/// Random opaque value carried through the redirect and echoed back, to
/// reject stray callbacks (CSRF protection, OAuth 2.0 §10.12).
pub fn random_state() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Builds the consent-screen URL the user's browser is opened with.
pub fn build_auth_url(
    config: &GoogleConfig,
    redirect_uri: &str,
    state: &str,
    pkce: &Pkce,
) -> Result<String, CoreError> {
    config.configured()?;
    let mut url = Url::parse(&config.endpoints.auth)
        .map_err(|e| CoreError::Internal(format!("bad auth endpoint: {e}")))?;
    url.query_pairs_mut()
        .append_pair("client_id", &config.client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPES)
        .append_pair("code_challenge", &pkce.challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state)
        // ask for a refresh token explicitly: consent is what guarantees one
        // is re-issued when a token already exists
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    Ok(url.into())
}

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub expires_in: Option<i64>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub scope: Option<String>,
}

impl TokenResponse {
    /// Access token lifetime with 60s of slack, as an absolute unix ms
    /// timestamp (what the settings/account tables store).
    pub fn expires_at_ms(&self) -> i64 {
        now_ms() + (self.expires_in.unwrap_or(3600).max(120) - 60) * 1000
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

async fn token_request(
    http: &reqwest::Client,
    config: &GoogleConfig,
    form: &[(&str, &str)],
) -> Result<TokenResponse, CoreError> {
    config.configured()?;
    let response = http
        .post(&config.endpoints.token)
        .form(form)
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(CoreError::Google(format!(
            "token endpoint returned {status}: {body}"
        )));
    }
    serde_json::from_str(&body).map_err(CoreError::from)
}

/// Exchanges the `code` from the redirect callback for tokens. On a desktop
/// client `client_secret` is `None`; the PKCE verifier proves the request.
pub async fn exchange_code(
    http: &reqwest::Client,
    config: &GoogleConfig,
    redirect_uri: &str,
    code: &str,
    code_verifier: &str,
) -> Result<TokenResponse, CoreError> {
    let mut form: Vec<(&str, &str)> = vec![
        ("client_id", config.client_id.as_str()),
        ("code", code),
        ("code_verifier", code_verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
    ];
    if let Some(secret) = config.client_secret.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        form.push(("client_secret", secret));
    }
    token_request(http, config, &form).await
}

/// Trades a refresh token for a fresh access token. Google may not repeat the
/// refresh token here — keep the stored one.
pub async fn refresh_access_token(
    http: &reqwest::Client,
    config: &GoogleConfig,
    refresh_token: &str,
) -> Result<TokenResponse, CoreError> {
    let mut form: Vec<(&str, &str)> = vec![
        ("client_id", config.client_id.as_str()),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];
    if let Some(secret) = config.client_secret.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        form.push(("client_secret", secret));
    }
    token_request(http, config, &form).await
}

/// Revokes the refresh token (and with it every access token minted from it)
/// when the user disconnects the account.
pub async fn revoke_token(
    http: &reqwest::Client,
    config: &GoogleConfig,
    token: &str,
) -> Result<(), CoreError> {
    let response = http
        .post(&config.endpoints.revoke)
        .form(&[("token", token)])
        .send()
        .await?;
    // revocation is best-effort: a token already invalid is fine too
    let status = response.status();
    if !status.is_success() && status != reqwest::StatusCode::BAD_REQUEST {
        return Err(CoreError::Google(format!(
            "revoke endpoint returned {status}"
        )));
    }
    Ok(())
}

#[derive(Deserialize)]
struct UserInfo {
    email: Option<String>,
}

/// Looks up the connected account's email for display. Best-effort: showing
/// "(unknown account)" is fine if this fails.
pub async fn fetch_userinfo_email(
    http: &reqwest::Client,
    config: &GoogleConfig,
    access_token: &str,
) -> Option<String> {
    let response = http
        .get(&config.endpoints.userinfo)
        .bearer_auth(access_token)
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    response.json::<UserInfo>().await.ok()?.email
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 7636 appendix B vector: verifier -> S256 challenge.
    #[test]
    fn pkce_s256_matches_reference_vector() {
        let pkce = Pkce::from_verifier("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk".to_string());
        assert_eq!(pkce.challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn pkce_generated_values_have_correct_shape() {
        let pkce = Pkce::generate();
        assert!(pkce.verifier.len() >= 43 && pkce.verifier.len() <= 128);
        assert!(!pkce.verifier.contains(['+', '/', '=']));
        assert!(!pkce.challenge.contains(['+', '/', '=']));
    }

    #[test]
    fn auth_url_carries_every_required_parameter() {
        let config = GoogleConfig {
            client_id: "client-123".to_string(),
            client_secret: None,
            endpoints: Default::default(),
        };
        let pkce = Pkce::generate();
        let url = build_auth_url(&config, "http://127.0.0.1:8123", "state-1", &pkce).unwrap();
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
        for needle in [
            "client_id=client-123",
            "redirect_uri=http%3A%2F%2F127.0.0.1%3A8123",
            "response_type=code",
            "code_challenge_method=S256",
            "access_type=offline",
            "prompt=consent",
            "state=state-1",
        ] {
            assert!(url.contains(needle), "missing {needle} in {url}");
        }
        assert!(url.contains(&pkce.challenge));
        assert!(url.contains("drive.appdata"));
    }
}
