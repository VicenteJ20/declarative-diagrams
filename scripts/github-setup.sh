#!/usr/bin/env bash
# Applies the repository protection described in docs/maintainers.md to GitHub.
# Needs the GitHub CLI (`gh auth login`) as a repository admin. Idempotent: run it again after changing .github/rulesets/*.json.
#
#   bash scripts/github-setup.sh [owner/repo]
set -uo pipefail

REPO="${1:-VicenteJ20/declarative-diagrams}"
cd "$(dirname "$0")/.."

step() { printf '\n== %s\n' "$1"; }
try() { "$@" >/dev/null && echo "ok: $*" | cut -c1-110 || echo "WARN (continuing): $*" | cut -c1-110; }

step "Repository settings: squash-only merges, delete merged branches, no wiki/projects"
try gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F allow_auto_merge=false -F has_wiki=false -F has_projects=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY

step "Security features: private vulnerability reporting, Dependabot alerts + security updates, secret scanning + push protection"
try gh api -X PUT "repos/$REPO/private-vulnerability-reporting"
try gh api -X PUT "repos/$REPO/vulnerability-alerts"
try gh api -X PUT "repos/$REPO/automated-security-fixes"
echo '{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}' |
  try gh api -X PATCH "repos/$REPO" --input -

step "Actions: read-only token, workflows cannot approve PRs, first-time contributors need approval, actions pinned by SHA"
try gh api -X PUT "repos/$REPO/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
try gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" -f approval_policy=all_external_contributors
try gh api -X PUT "repos/$REPO/actions/permissions" -F enabled=true -f allowed_actions=all -F sha_pinning_required=true

step "Rulesets (create or update by name)"
for f in .github/rulesets/*.json; do
  name=$(node -p "require('./$f').name")
  id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$name\") | .id" 2>/dev/null || true)
  if [ -n "$id" ]; then
    try gh api -X PUT "repos/$REPO/rulesets/$id" --input "$f"
  else
    try gh api -X POST "repos/$REPO/rulesets" --input "$f"
  fi
done

step "Result"
gh api "repos/$REPO/rulesets" --jq '.[] | "\(.name)  [\(.enforcement)]"'
