#!/bin/bash
# query-facts.sh — Query organizational facts from MyaOS database
# Usage:
#   ./bin/query-facts.sh "BlockType"              # search claim text
#   ./bin/query-facts.sh --category architecture   # filter by category
#   ./bin/query-facts.sh --tag "p0"                # filter by tag
#   ./bin/query-facts.sh --active                  # only active facts
#   ./bin/query-facts.sh --stale                   # only stale facts

set -e

DB_PATH="${DB_PATH:-$(cd "$(dirname "$0")/.." && pwd)/data/myaos.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH" >&2
  exit 1
fi

# Parse arguments
SEARCH_TERM=""
FILTER_CATEGORY=""
FILTER_TAG=""
FILTER_STATUS="active"  # default to active only
SHOW_EVIDENCE=0
JSON_OUTPUT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --category) FILTER_CATEGORY="$2"; shift 2 ;;
    --tag) FILTER_TAG="$2"; shift 2 ;;
    --status) FILTER_STATUS="$2"; shift 2 ;;
    --all-status) FILTER_STATUS=""; shift ;;
    --active) FILTER_STATUS="active"; shift ;;
    --stale) FILTER_STATUS="stale"; shift ;;
    --evidence) SHOW_EVIDENCE=1; shift ;;
    --json) JSON_OUTPUT=1; shift ;;
    --help)
      echo "Usage: $0 [search_term] [--category CAT] [--tag TAG] [--status STATUS] [--evidence] [--json] [--all-status]"
      echo ""
      echo "Examples:"
      echo "  $0 BlockType"
      echo "  $0 --category architecture"
      echo "  $0 --tag p0 --evidence"
      echo "  $0 hairstyle --json"
      exit 0
      ;;
    *)
      SEARCH_TERM="$1"
      shift
      ;;
  esac
done

# Build WHERE clause
WHERE_CLAUSES=()

if [ -n "$FILTER_STATUS" ]; then
  WHERE_CLAUSES+=("status = '$FILTER_STATUS'")
fi

if [ -n "$FILTER_CATEGORY" ]; then
  WHERE_CLAUSES+=("category = '$FILTER_CATEGORY'")
fi

if [ -n "$FILTER_TAG" ]; then
  WHERE_CLAUSES+=("tags LIKE '%$FILTER_TAG%'")
fi

if [ -n "$SEARCH_TERM" ]; then
  WHERE_CLAUSES+=("claim LIKE '%$SEARCH_TERM%'")
fi

WHERE_SQL=""
if [ ${#WHERE_CLAUSES[@]} -gt 0 ]; then
  WHERE_SQL="WHERE $(IFS=" AND "; echo "${WHERE_CLAUSES[*]}")"
fi

# Query and format
if [ $JSON_OUTPUT -eq 1 ]; then
  # JSON output
  sqlite3 -json "$DB_PATH" "SELECT id, claim, category, repository, status, verified_at, tags FROM facts $WHERE_SQL ORDER BY verified_at DESC LIMIT 50;"
else
  # Human-readable output
  if [ $SHOW_EVIDENCE -eq 1 ]; then
    sqlite3 -header -column "$DB_PATH" "SELECT id, claim, category, status, verified_by, verified_at, evidence FROM facts $WHERE_SQL ORDER BY verified_at DESC LIMIT 50;"
  else
    sqlite3 -header -column "$DB_PATH" "SELECT id, claim, category, status, verified_at FROM facts $WHERE_SQL ORDER BY verified_at DESC LIMIT 50;"
  fi
fi
