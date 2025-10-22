#!/bin/bash
set -e

# React Native SDK Release Script
# This script handles the full release process:
# 1. Version bump and changelog
# 2. Build
# 3. Push to public repo (git subtree)
# 4. Publish to npm

echo "🚀 Starting React Native SDK release process..."

# Ensure we're in the monorepo root
MONOREPO_ROOT="$(git rev-parse --show-toplevel)"
PACKAGE_PATH="packages/dln-react-native"
PUBLIC_REPO_URL="git@github.com:deeplinknow/dln-react-native.git"
PUBLIC_REMOTE="dln-react-native-public"

cd "$MONOREPO_ROOT"

# Check if we have uncommitted changes
if [[ -n $(git status -s) ]]; then
  echo "❌ Error: You have uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Ensure public remote exists at monorepo level
if ! git remote | grep -q "^${PUBLIC_REMOTE}$"; then
  echo "📌 Adding public remote: $PUBLIC_REMOTE"
  git remote add "$PUBLIC_REMOTE" "$PUBLIC_REPO_URL"
else
  echo "✅ Public remote already exists: $PUBLIC_REMOTE"
fi

# Fetch from public repo
echo "🔄 Fetching from public repo..."
git fetch "$PUBLIC_REMOTE" || true

# Navigate to package directory for release-it
cd "$PACKAGE_PATH"

# Run release-it (will bump version, create changelog, tag, and commit)
echo "📦 Running release-it..."
pnpm release-it

# Get the new version and tag
NEW_VERSION=$(node -p "require('./package.json').version")
NEW_TAG="v${NEW_VERSION}"

echo "✅ Version bumped to: $NEW_VERSION"

# Go back to monorepo root for subtree operations
cd "$MONOREPO_ROOT"

# Push the package subdirectory to public repo using subtree
echo "🌳 Pushing to public repo via git subtree..."

# Split the subtree into a temporary branch
TEMP_BRANCH="temp-subtree-split-$(date +%s)"
echo "📂 Splitting subtree to temporary branch: $TEMP_BRANCH"
git subtree split --prefix="$PACKAGE_PATH" -b "$TEMP_BRANCH"

# Force push the split branch to public repo (monorepo is source of truth)
echo "🚀 Force pushing to public repo..."
git push "$PUBLIC_REMOTE" "$TEMP_BRANCH:main" --force

# Clean up temporary branch
echo "🧹 Cleaning up temporary branch..."
git branch -D "$TEMP_BRANCH"

# Publish to npm
echo "📤 Publishing to npm..."
cd "$PACKAGE_PATH"
npm publish

echo ""
echo "✅ Release complete!"
echo "   Version: $NEW_VERSION"
echo "   Tag: $NEW_TAG"
echo "   Public repo: https://github.com/deeplinknow/dln-react-native"
echo "   npm: https://www.npmjs.com/package/@deeplinknow/react-native"
