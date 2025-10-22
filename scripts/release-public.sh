#!/bin/bash
set -e

# React Native SDK Release Script
# This script handles the full release process:
# 1. Version bump and changelog
# 2. Publish to npm
# 3. Push to GitHub

echo "🚀 Starting React Native SDK release process..."

# Ensure we're in the repo root
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Check if we have uncommitted changes
if [[ -n $(git status -s) ]]; then
  echo "❌ Error: You have uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Run release-it (will bump version, create changelog, tag, and commit)
echo "📦 Running release-it..."
pnpm release-it

# Get the new version and tag
NEW_VERSION=$(node -p "require('./package.json').version")
NEW_TAG="v${NEW_VERSION}"

echo "✅ Version bumped to: $NEW_VERSION"

# Publish to npm
echo "📤 Publishing to npm..."
npm publish

echo ""
echo "✅ Release complete!"
echo "   Version: $NEW_VERSION"
echo "   Tag: $NEW_TAG"
echo "   npm: https://www.npmjs.com/package/@deeplinknow/react-native"
