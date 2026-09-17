# Dependencies and Node version

## Node 22

| Where | How it is set |
|---|---|
| Local development | `.nvmrc` → `22` (`nvm use`, `fnm use`, Volta all read it) |
| CI | `actions/setup-node` with `node-version: 22` in `.github/workflows/ci.yml` |
| Vercel (production and previews) | `engines.node: "22.x"` in `apps/web/package.json`; Vercel reads it and it overrides the project setting |
| Repository as a whole | `engines.node: ">=22"` in the root `package.json` (a warning on older Node, not an error) |

`@types/node` in the web app and the shared packages is on the 22 line to match.
The edge gateway keeps its own Node and `@types/node` until its upgrade work
(section 9 of the code review); its manifest has no `engines` yet because the
Node version on the deployed Raspberry Pi has to be checked first.

Newer local Node versions work; npm prints an `EBADENGINE` warning for
`apps/web` and carries on.

## Exact versions

Every registry dependency in every workspace manifest is an exact version,
identical to what `package-lock.json` had installed when they were pinned, so
pinning changed nothing at runtime. The three `*` entries in `apps/web` are the
internal workspace packages.

Why: with `^` ranges the manifest says one thing and the lockfile another, a
stray `npm install` can move forty packages at once, and the Pi, which installs
the gateway without a lockfile, resolved whatever was newest that day. With
exact versions an upgrade is always a visible diff.

`.npmrc` sets `save-exact=true`, so `npm install <pkg>` keeps the convention.

## Upgrading

- **One package:** `npm install <pkg>@<version> -w web` (or `-w edge-gateway`,
  or no `-w` for root tooling). Commit `package.json` and `package-lock.json`.
- **Routine updates:** Dependabot opens one grouped PR a month for minor and
  patch versions, and separate PRs for majors and for GitHub Actions. CI runs on
  each; merge when green and the changelogs look harmless.
- **Security:** `npm audit` for the list; fix by upgrading the named package as
  above. Transitive-only findings usually clear with `npm update <parent>`.
- Never edit a version by hand without running `npm install` afterwards:
  `npm ci` (used by CI and Vercel) fails when the manifest and the lockfile
  disagree.
