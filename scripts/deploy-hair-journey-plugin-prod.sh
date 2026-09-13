#!/usr/bin/env bash
# ==============================================================================
# deploy-hair-journey-plugin-prod.sh
# Automates synchronization and deployment of the MYAVANA Hair Journey Next
# WordPress plugin to the production server.
#
# Credentials are read strictly from gitignored environment files:
#   community/secrets/production_wp_credentials.env
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Resolve credentials file
CREDS_FILE=""
CANDIDATES=(
  "${REPO_ROOT}/community/secrets/production_wp_credentials.env"
  "/Users/winstonzulu/WebstormProjects/CreativeSites-Ai-Team/community/secrets/production_wp_credentials.env"
  "/Users/winstonzulu/WebstormProjects/Myavana-Chatbot/community/secrets/production_wp_credentials.env"
)

for f in "${CANDIDATES[@]}"; do
  if [[ -f "${f}" ]]; then
    CREDS_FILE="${f}"
    break
  fi
done

if [[ -z "${CREDS_FILE}" ]]; then
  echo "❌ Error: Production credentials file not found!"
  echo "Expected at: ${REPO_ROOT}/community/secrets/production_wp_credentials.env"
  echo "Ensure you have created the gitignored secrets file before running."
  exit 1
fi

# Source credentials
# shellcheck disable=SC1090
source "${CREDS_FILE}"

# Flags
DRY_RUN=false
SKIP_CACHE_FLUSH=false
SKIP_WIDGET_SYNC=false

for arg in "$@"; do
  case "${arg}" in
    --dry-run)
      DRY_RUN=true
      ;;
    --skip-cache-flush)
      SKIP_CACHE_FLUSH=true
      ;;
    --skip-widget-sync)
      SKIP_WIDGET_SYNC=true
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --dry-run            Simulate rsync transfer without writing files"
      echo "  --skip-cache-flush   Do not run 'wp cache flush' after sync"
      echo "  --skip-widget-sync   Do not run sync-widget-to-wp.sh prior to sync"
      echo "  -h, --help           Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: ${arg}"
      exit 1
      ;;
  esac
done

echo "=================================================================="
echo "🚀 MYAVANA HAIR JOURNEY — PRODUCTION PLUGIN DEPLOYMENT"
echo "=================================================================="
echo "📍 Target Host:       ${PROD_SSH_HOST}:${PROD_SSH_PORT}"
echo "📍 Target User:       ${PROD_SSH_USER}"
echo "📍 Remote Root:       ${PROD_REMOTE_WP_ROOT}"
echo "📍 Remote Plugin Dir: ${PROD_REMOTE_PLUGIN_DIR}"
echo "📍 Local Plugin Dir:  ${LOCAL_PLUGIN_DIR}"
echo "📍 Primary Site URL:  ${PROD_PRIMARY_URL}"
echo "📍 Dry Run:           ${DRY_RUN}"
echo "=================================================================="

# Check tool dependencies
SSHPASS_BIN="$(which sshpass 2>/dev/null || echo "/opt/homebrew/bin/sshpass")"
if [[ ! -x "${SSHPASS_BIN}" ]]; then
  echo "❌ Error: 'sshpass' is required but not found."
  echo "Install with: brew install sshpass"
  exit 1
fi

if ! command -v rsync &> /dev/null; then
  echo "❌ Error: 'rsync' is required but not found."
  exit 1
fi

if [[ ! -d "${LOCAL_PLUGIN_DIR}" ]]; then
  echo "❌ Error: Local plugin directory not found at: ${LOCAL_PLUGIN_DIR}"
  exit 1
fi

if [[ ! -f "${LOCAL_PLUGIN_DIR}/myavana-hair-journey-next.php" ]]; then
  echo "❌ Error: Main plugin file missing from: ${LOCAL_PLUGIN_DIR}"
  exit 1
fi

# Step 1: Synchronize widget asset if chatbot repo exists
if [[ "${SKIP_WIDGET_SYNC}" == false ]]; then
  SYNC_WIDGET_SCRIPT="${LOCAL_CHATBOT_REPO:-/Users/winstonzulu/WebstormProjects/Myavana-Chatbot}/scripts/sync-widget-to-wp.sh"
  if [[ -f "${SYNC_WIDGET_SCRIPT}" ]]; then
    echo ""
    echo "📦 [1/4] Syncing latest web widget build into plugin assets..."
    bash "${SYNC_WIDGET_SCRIPT}" || {
      echo "⚠️ Widget sync returned an error. Proceeding with existing assets."
    }
  else
    echo "ℹ️ [1/4] Widget sync script not found; skipping."
  fi
else
  echo "ℹ️ [1/4] Widget sync skipped (--skip-widget-sync)."
fi

# Export password for sshpass
export SSHPASS="${PROD_SSH_PASS}"

# Step 2: Test SSH Connectivity
echo ""
echo "🔌 [2/4] Testing SSH connectivity to ${PROD_SSH_HOST}..."
"${SSHPASS_BIN}" -e ssh -o ConnectTimeout=10 -o ServerAliveInterval=15 -p "${PROD_SSH_PORT}" \
  "${PROD_SSH_USER}@${PROD_SSH_HOST}" "echo '  Connected successfully as ${PROD_SSH_USER}'"

# Step 3: Run rsync to deploy plugin files
echo ""
RSYNC_OPTS=(
  -avz
  --delete
  --exclude='.git*'
  --exclude='.DS_Store'
  --exclude='_backup*'
  --exclude='tests*'
  --exclude='.claude*'
  --exclude='*.log'
  --exclude='node_modules*'
)

if [[ "${DRY_RUN}" == true ]]; then
  RSYNC_OPTS+=(--dry-run)
  echo "📤 [3/4] Running rsync in DRY-RUN mode (no changes will be written)..."
else
  echo "📤 [3/4] Deploying plugin files to production server..."
fi

"${SSHPASS_BIN}" -e rsync "${RSYNC_OPTS[@]}" \
  -e "ssh -o ConnectTimeout=10 -o ServerAliveInterval=15 -p ${PROD_SSH_PORT}" \
  "${LOCAL_PLUGIN_DIR}/" \
  "${PROD_SSH_USER}@${PROD_SSH_HOST}:${PROD_REMOTE_PLUGIN_DIR}/"

if [[ "${DRY_RUN}" == true ]]; then
  echo ""
  echo "✅ Dry run completed successfully. No changes were committed to remote."
  exit 0
fi

# Step 4: Verification & Cache Flushing
echo ""
echo "🔍 [4/4] Verifying remote plugin activation & invalidating cache..."

# Verify plugin active
PLUGIN_CHECK=$("${SSHPASS_BIN}" -e ssh -o ConnectTimeout=10 -o ServerAliveInterval=15 -p "${PROD_SSH_PORT}" \
  "${PROD_SSH_USER}@${PROD_SSH_HOST}" \
  "wp --path=${PROD_REMOTE_WP_ROOT} plugin is-active myavana-hair-journey-next && echo 'ACTIVE' || echo 'INACTIVE'")

if echo "${PLUGIN_CHECK}" | grep -q "ACTIVE"; then
  echo "  ✅ Plugin 'myavana-hair-journey-next' is ACTIVE on production."
else
  echo "  ⚠️ Warning: Plugin is not active. Activating..."
  "${SSHPASS_BIN}" -e ssh -o ConnectTimeout=10 -o ServerAliveInterval=15 -p "${PROD_SSH_PORT}" \
    "${PROD_SSH_USER}@${PROD_SSH_HOST}" \
    "wp --path=${PROD_REMOTE_WP_ROOT} plugin activate myavana-hair-journey-next"
fi

# Cache flush
if [[ "${SKIP_CACHE_FLUSH}" == false ]]; then
  echo "  🧹 Flushing WordPress cache via WP-CLI..."
  "${SSHPASS_BIN}" -e ssh -o ConnectTimeout=10 -o ServerAliveInterval=15 -p "${PROD_SSH_PORT}" \
    "${PROD_SSH_USER}@${PROD_SSH_HOST}" \
    "wp --path=${PROD_REMOTE_WP_ROOT} cache flush" 2>&1 | grep -v "E_WARNING" || true
  echo "  ✅ Remote cache flushed."
else
  echo "  ℹ️ Cache flush skipped (--skip-cache-flush)."
fi

# HTTP Health check
echo ""
echo "🌐 Running HTTP health check..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L "${PROD_PRIMARY_URL}" || echo "000")
echo "  Target: ${PROD_PRIMARY_URL} -> HTTP ${HTTP_STATUS}"

if [[ "${HTTP_STATUS}" =~ ^(200|301|302)$ ]]; then
  echo ""
  echo "=================================================================="
  echo "🎉 DEPLOYMENT COMPLETE & VERIFIED!"
  echo "=================================================================="
  echo "Site URL: ${PROD_PRIMARY_URL}"
  echo "Time:     $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "=================================================================="
else
  echo ""
  echo "⚠️ Warning: HTTP status was ${HTTP_STATUS}. Please verify site manually."
fi
