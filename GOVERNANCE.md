# Governance

declarative-diagrams is a **maintainer-led** project (a "benevolent dictator" model, like many young open-source projects).
It is public so anyone can use it, fork it and propose changes; **what lands on `main` is decided by the maintainer**.

## Roles

| Role | Who | Can |
|---|---|---|
| **Maintainer** | [@VicenteJ20](https://github.com/VicenteJ20) | Review and merge pull requests, cut releases, change the rules in this file |
| **Contributor** | Anyone | Open issues, discussions and pull requests from a fork |

## How a change gets in

1. Open an issue (or comment on one) for anything bigger than a typo, so the direction is agreed before the work is done.
2. Fork, branch, and open a pull request against `main` (see [CONTRIBUTING.md](CONTRIBUTING.md)).
3. CI must pass: build and tests on Linux, Windows and macOS (the `required` check).
4. The maintainer reviews. Changes are **squash-merged** after approval; nobody pushes directly to `main`, including the maintainer.
5. Security-sensitive paths (`.github/`, dependency files, licence and notice files, the SVG sanitiser, the MCP server) are always reviewed
   by the maintainer, as listed in [`.github/CODEOWNERS`](.github/CODEOWNERS).

## What the maintainer will not merge

- Official Azure or AWS icon packs, or any asset whose licence does not allow redistribution (see [ICONS-DISCLAIMER.md](ICONS-DISCLAIMER.md)).
- Changes that weaken the safety guarantees in [docs/security.md](docs/security.md) (escaping, sanitising, path confinement).
- New runtime dependencies without a clear need, or with an incompatible licence.

## Decisions and disagreements

Decisions are made in the open on issues and pull requests, with reasons. The maintainer has the final say; a contributor who disagrees
is welcome to fork under the [MIT licence](LICENSE).

## Releases

Versioning follows [semver](https://semver.org). Release tags (`v*`) cannot be deleted or moved once pushed. Security fixes are
published through GitHub security advisories (see [SECURITY.md](SECURITY.md)).

## Changing this document

By pull request, approved by the maintainer.
