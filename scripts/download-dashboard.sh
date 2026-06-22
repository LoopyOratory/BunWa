#!/bin/bash

# Download WAHA Dashboard from GitHub
set -e

DASHBOARD_REPO="devlikeapro/dashboard"
DASHBOARD_SHA="47244c7d9202e0f4c1b23d12d45d5c208cd1184f"
DASHBOARD_DIR="$(dirname "$0")/dashboard"

echo "Downloading WAHA Dashboard..."
echo "Repo: $DASHBOARD_REPO"
echo "SHA: $DASHBOARD_SHA"

# Create temp directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Download and extract
curl -sL "https://github.com/$DASHBOARD_REPO/archive/$DASHBOARD_SHA.zip" -o dashboard.zip
unzip -q dashboard.zip

# Move to target
mkdir -p "$DASHBOARD_DIR"
cp -r "dashboard-$DASHBOARD_SHA"/* "$DASHBOARD_DIR/"

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo "Dashboard downloaded to: $DASHBOARD_DIR"
echo "Access it at: http://localhost:3000/dashboard"
