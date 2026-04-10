use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::net::SocketAddr;

#[derive(Serialize)]
struct HealthResponse {
    code: u16,
    message: &'static str,
    data: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        code: 0,
        message: "ok",
        data: "healthy",
    })
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let app = Router::new().route("/api/v1/health", get(health));
    let addr: SocketAddr = "0.0.0.0:3320".parse().expect("invalid listen addr");
    tracing::info!("moment-pic rust backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind failed");
    axum::serve(listener, app).await.expect("server error");
}
