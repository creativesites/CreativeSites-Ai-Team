pub mod db;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Clone)]
pub struct SystemManager {
    sleep_prevented: Arc<AtomicBool>,
    pub db_bridge: Arc<db::DbBridge>,
}

impl SystemManager {
    pub fn new(db_path: &str) -> Self {
        Self {
            sleep_prevented: Arc::new(AtomicBool::new(false)),
            db_bridge: Arc::new(db::DbBridge::new(db_path)),
        }
    }

    pub fn enable_sleep_prevention(&self) -> Result<bool, String> {
        self.sleep_prevented.store(true, Ordering::Relaxed);
        Ok(true)
    }

    pub fn disable_sleep_prevention(&self) -> Result<bool, String> {
        self.sleep_prevented.store(false, Ordering::Relaxed);
        Ok(false)
    }

    pub fn is_sleep_prevented(&self) -> bool {
        self.sleep_prevented.load(Ordering::Relaxed)
    }
}
