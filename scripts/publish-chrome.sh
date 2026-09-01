#!/usr/bin/env bash
#
# Upload a zip to the Chrome Web Store and submit it for review, failing loudly when the store says no.
#
# This replaces `wxt submit`. The library behind it (publish-browser-extension) does `await fetch(...)`
# for both the upload and the publish and discards the response; fetch does not reject on 4xx, so a
# refused upload printed the same success line as an accepted one. Three releases reported success
# while the store's draft stayed at the version before them.
#
# Usage: scripts/publish-chrome.sh [--upload-only] <zip-path>
#
# --upload-only stops after the upload. An upload only replaces the draft, so it can answer "does the
# store accept our package at all" without putting anything into the review queue.

set -euo pipefail

publish=true
if [ "${1:-}" = "--upload-only" ]; then
  publish=false
  shift
fi

zip=${1:?usage: publish-chrome.sh [--upload-only] <zip-path>}

for name in CHROME_EXTENSION_ID CHROME_CLIENT_ID CHROME_CLIENT_SECRET CHROME_REFRESH_TOKEN; do
  if [ -z "${!name:-}" ]; then
    echo "::error::${name} is not set — the store credentials are incomplete."
    exit 1
  fi
done

if [ ! -f "$zip" ]; then
  echo "::error::no zip at ${zip}"
  exit 1
fi

echo "zip: ${zip} ($(stat -c%s "$zip") bytes)"

# --- token -----------------------------------------------------------------------------------------

token_response=$(curl -sS -X POST https://oauth2.googleapis.com/token \
  -d "client_id=${CHROME_CLIENT_ID}" \
  -d "client_secret=${CHROME_CLIENT_SECRET}" \
  -d "refresh_token=${CHROME_REFRESH_TOKEN}" \
  -d "grant_type=refresh_token")

token=$(echo "$token_response" | jq -r '.access_token // empty')
if [ -z "$token" ]; then
  # The body carries the OAuth error but never the token, so it is safe to print.
  echo "::error::could not exchange the refresh token — the OAuth chain needs re-authorising."
  echo "$token_response" | jq '{error, error_description}'
  exit 1
fi

api() {
  curl -sS -o "$2" -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" \
    -H "x-goog-api-version: 2" \
    "${@:3}"
}

# --- upload ----------------------------------------------------------------------------------------

echo "uploading…"
status=$(api /tmp/cws-upload.json -X PUT -T "$zip" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${CHROME_EXTENSION_ID}")

upload_state=$(jq -r '.uploadState // "absent"' /tmp/cws-upload.json)
echo "upload: HTTP ${status}, uploadState ${upload_state}"

if [ "$status" != "200" ] || [ "$upload_state" = "FAILURE" ] || [ "$upload_state" = "absent" ]; then
  echo "::error::the store refused the upload."
  cat /tmp/cws-upload.json
  exit 1
fi

# --- submit for review -----------------------------------------------------------------------------

if [ "$publish" = false ]; then
  echo "--upload-only: stopping before the review queue."
  jq '{uploadState, crxVersion, itemError}' /tmp/cws-upload.json
  exit 0
fi

echo "submitting for review…"
status=$(api /tmp/cws-publish.json -X POST -H 'Content-Length: 0' \
  "https://www.googleapis.com/chromewebstore/v1.1/items/${CHROME_EXTENSION_ID}/publish")

echo "publish: HTTP ${status}"
cat /tmp/cws-publish.json

# The publish call answers with a status array; anything outside these two means it did not take.
if [ "$status" != "200" ] || ! jq -e '
      (.status // []) | length > 0 and all(. == "OK" or . == "ITEM_PENDING_REVIEW")
    ' /tmp/cws-publish.json >/dev/null; then
  echo "::error::the store refused to publish."
  exit 1
fi

{
  echo "### Chrome Web Store"
  echo ""
  echo "- uploaded \`$(basename "$zip")\`, uploadState \`${upload_state}\`"
  echo "- publish status \`$(jq -rc '.status // []' /tmp/cws-publish.json)\`"
  echo "- crxVersion now \`$(jq -r '.crxVersion // "unknown"' /tmp/cws-upload.json)\`"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
