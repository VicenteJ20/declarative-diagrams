# Maintainers guide: how the repository is protected

The repository is public; **only the maintainer approves what reaches `main`**. The protection is kept as code in the repo and
applied with one command, so it can be reviewed, reproduced and restored.

## What is enforced

**`main` (ruleset `main protection`, [`.github/rulesets/main.json`](../.github/rulesets/main.json))**

| Rule | Effect |
|---|---|
| Pull request required | No direct pushes to `main`. Squash merge only; linear history |
| 1 approval + **code owner review** | `CODEOWNERS` lists the maintainer for every path, so nothing merges without them |
| Stale approvals dismissed, last push needs approval | An approved PR cannot be changed afterwards without a new approval |
| Conversations must be resolved | Review comments cannot be ignored |
| Required status check `required` | Build and tests green on Linux, Windows and macOS (Node 22 and 24); branch must be up to date |
| No force push, no deletion | History cannot be rewritten |
| Bypass: repository admin, **pull requests only** | The maintainer can merge their own PR (GitHub does not let you approve it yourself) but still cannot push to `main` directly |

**Tags (`release tags`, [`.github/rulesets/release-tags.json`](../.github/rulesets/release-tags.json)):** `v*` tags cannot be deleted or moved.

**Repository settings** (applied by the script): squash merges only, merged branches deleted, wiki and projects off, private
vulnerability reporting on, Dependabot alerts and security updates on, secret scanning and push protection on.

**Actions:** the default `GITHUB_TOKEN` is read-only and cannot approve pull requests; workflows from first-time contributors need
approval before they run; every action is pinned to a commit SHA (Dependabot keeps the pins current); the workflows declare their own
least-privilege `permissions` and never persist checkout credentials.

**Automation:** Dependabot (npm and Actions, weekly, grouped), CodeQL (`security-extended`, on every PR and weekly), CI (`ci.yml`).

## Applying or updating it

```bash
gh auth login                      # as the repository admin
bash scripts/github-setup.sh       # idempotent; accepts owner/repo as an argument
```

Edit the JSON under `.github/rulesets/` and run the script again to change a rule. Check the result under
*Settings → Rules → Rulesets*.

## Day-to-day

- **Merging a contributor's PR:** review → *Approve* → *Squash and merge* (the `required` check must be green).
- **Merging your own PR:** open it, wait for `required`, then *Squash and merge* using the admin bypass (offered because you are an admin).
- **Releases:** tag `vX.Y.Z` on `main` (tags are protected), then publish the GitHub release; update `CHANGELOG.md` in the release PR.
- **Dependabot PRs:** review the grouped update, let CI run, squash-merge. Major version bumps get their own PR on purpose.
- **Vulnerability reports:** they arrive as private advisories (*Security → Advisories*); fix in a private fork branch, publish the advisory.

## Hardening you can add later

- **Signed commits** (`required_signatures` rule) once every maintainer signs commits.
- **2FA enforcement** and **passkeys/security keys** on the maintainer account (the most important single control).
- **npm provenance** (`npm publish --provenance` from a workflow with `id-token: write`) when the packages are published.
- **Second maintainer:** add them to `CODEOWNERS` and raise the required approvals to 2 so the bypass is no longer needed.
