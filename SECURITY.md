# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting:
<https://github.com/VicenteJ20/declarative-diagrams/security/advisories/new>.
Include a minimal spec or file that reproduces the problem. You can expect a first reply within a week.

## Scope

The model and what is guarded is described in [docs/security.md](docs/security.md). Of particular interest: injection into exported
SVGs (theme values, icons, text), escaping the MCP server's `--root`, and unsafe handling of icon zips.

Only the latest commit on `main` is supported until the first tagged release.
