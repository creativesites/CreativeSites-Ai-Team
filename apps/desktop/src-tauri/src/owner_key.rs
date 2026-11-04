//! Owner key (security review S1, programme plan K4).
//!
//! Agents run as the owner's macOS user and can read the runtime token file, so actions only the
//! owner may take (approvals, shipping, policies, settings, timesheet approval) also need an owner
//! key. The key lives in the login Keychain, created by this app, so the item's access list trusts
//! only the MyaOS app: another process (an agent running `security find-generic-password`) triggers
//! a macOS prompt instead of reading it silently. The runtime stores only a SHA-256 of the key.

use keyring::Entry;
use std::io::Read;

const SERVICE: &str = "com.creativesites.myaos";
const ACCOUNT: &str = "owner-key";

fn random_hex(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf))
        .map_err(|e| format!("could not read randomness: {e}"))?;
    Ok(buf.iter().map(|b| format!("{b:02x}")).collect())
}

/// Returns the owner key, creating and storing it on first use.
#[tauri::command]
pub fn owner_key() -> Result<String, String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("keychain unavailable: {e}"))?;
    match entry.get_password() {
        Ok(key) if key.len() == 64 => Ok(key),
        Ok(_) | Err(keyring::Error::NoEntry) => {
            let key = random_hex(32)?;
            entry.set_password(&key).map_err(|e| format!("could not store the owner key: {e}"))?;
            Ok(key)
        }
        Err(e) => Err(format!("could not read the owner key: {e}")),
    }
}
