# Automatic deployment to caldence.de and operator imprint: design

Date: 2026-11-11. Status: agreed with the maintainer.

## Goals

1. Every published release goes to https://caldence.de/ without manual uploads.
2. The SFTP credentials never become public. The repository is public.
3. The imprint and privacy page belong to the operator. They are not in the repository and not in the release ZIP.

## Hosting

Hetzner webhosting (smallest package): SFTP on port 22 with a public key, no SSH shell. A key works only for the FTP main user. The app lives at the root of the web folder.

## Threat model

| Threat | Measure |
| --- | --- |
| Key in the repository, a log or an artifact | The private key is only a secret of the GitHub environment `production`. GitHub masks secrets in logs. No step prints, writes to an artifact or uploads it; it is written to a `0600` file under `$RUNNER_TEMP` and deleted at the end of the job. |
| A pull request or fork reads the secret | PR runs never get environment secrets. No `pull_request_target`. `production` allows only the branch `main`. |
| A compromised npm package reads the secret | The deploy job runs no npm. It checks out only `scripts/deploy-plan.mjs` (before the key is written) and runs it with the runner's preinstalled Node. It downloads the published ZIP, checks its checksum and build attestation, and uploads it with the preinstalled OpenSSH `sftp`. |
| A third-party action reads the secret | The deploy job uses only GitHub's own `actions/checkout` (pinned, before the key exists) and shell steps. |
| Someone pretends to be the server | The server's host key is pinned (`known_hosts` as an environment variable, `StrictHostKeyChecking yes`). |
| A malicious workflow change reaches `main` (pull requests merge automatically and are authored as the maintainer, so a code-owner review cannot stop it) | The maintainer is a **required reviewer** of `production`. No job gets the key without his "Approve" click on that run. |
| The key leaks anyway | It reaches only the webspace files (no konsoleH, domain, mail or billing). The maintainer deletes it in konsoleH to lock it out at once. |

Only the maintainer enters or changes secrets, variables and environment protection rules. Claude never does.

## GitHub settings (maintainer)

Environment `production`:

- Deployment branches: `main` only.
- Required reviewer: the maintainer. "Prevent self-review" stays off, because the runs are started under his account.
- Secret `SFTP_PRIVATE_KEY`: the private key (ed25519).
- Secrets `SFTP_HOST` (for example `wwwNNN.your-server.de`), `SFTP_USER` and `SFTP_KNOWN_HOSTS`: not credentials, but kept out of logs and settings so nobody trying passwords on the host learns them here (the known_hosts line names the host).
- Variable (not secret): `SFTP_PATH` (the web folder, for example `public_html`). `SFTP_KNOWN_HOSTS` is the output of `ssh-keyscan -t ed25519 <host>`, checked against the fingerprint shown in konsoleH or at the first `sftp` login.

## Workflow

New workflow `.github/workflows/deploy.yml`:

- Trigger: `workflow_dispatch` with input `version`. The `publish` job of `release.yml` starts it after the release (a release made with `GITHUB_TOKEN` starts no workflow, a dispatch does). The maintainer can start it by hand for a rollback or re-deploy of any published release.
- `permissions: {}` at the top; the job gets `contents: read` and `attestations: read`.
- Job `deploy`, `if: github.ref == 'refs/heads/main'`, `environment: production` (the run waits for approval here), `concurrency: deploy` without cancelling.
  1. Check `version` matches `^[0-9]+\.[0-9]+\.[0-9]+$` (it is passed through `env`, never inlined into the script).
  2. `gh release download v<version>` the ZIP and its `.sha256`, run `sha256sum -c` and `gh attestation verify --repo gallandp/caldence --signer-workflow gallandp/caldence/.github/workflows/release.yml --source-ref refs/heads/main`, so only a ZIP built by the release workflow on `main` passes.
  3. Unzip into a temporary folder. Fail if it contains `imprint.html` or `privacy.html`.
  4. Write the key and `known_hosts`, fetch the previous file list `.caldence-deploy-files` from the server (missing on the first deploy).
  5. `node scripts/deploy-plan.mjs` (plain Node, no dependencies, no npm) turns the new file list and the old one into an `sftp` batch in this order:
     1. create folders, upload every file except the entry points;
     2. upload `index.html`, `sw.js`, `manifest.webmanifest`;
     3. if files are due for deletion: upload a list that still names them, delete them, then remove their empty folders;
     4. upload the new `.caldence-deploy-files`.

     The list names the files of the current release and, in a second section, those of the release before that the current one no longer has. Those stay for one more deployment, so a browser or service worker still on the previous version finds every file it asks for. Only files from that second section of the old list are deleted. `imprint.html`, `privacy.html` and the list itself are never deleted. Paths with `..`, absolute paths or characters outside `[A-Za-z0-9._/-]` are rejected. A run cut off midway leaves a list that still names every file it uploaded or meant to delete.

     Users therefore never see an `index.html` that points at missing assets.
  6. Run the batch with `sftp -b - -i <key> -o StrictHostKeyChecking=yes -o UserKnownHostsFile=<file> -o BatchMode=yes <user>@<host>`, after `cd` into `SFTP_PATH`. Delete the key file in an `always()` step.
- Job `smoke`, `needs: deploy`, no environment and no secrets: checks out the tag of the deployed version and runs its `tests/deploy` against `https://caldence.de/` in the pinned Playwright image used by CI. A rollback is thus checked against what that version shipped.

The deployment is a separate run, not a job of `release.yml`: a run waiting for approval would otherwise hold the `release` concurrency group and stop the next release PR.

The first deploy finds no file list, so it overwrites and deletes nothing. Files uploaded by hand before that stay until the maintainer removes them.

## Imprint and privacy page

- `imprint.html` and optional `privacy.html` are uploaded once by the operator next to the app. The deployment never uploads, overwrites or deletes them.
- The app shows the links "Impressum" / "Imprint" and "Datenschutz" / "Privacy" in the sidebar footer (`src/ui/Shell.svelte`, next to the language switch) only if the file exists: at start, a `HEAD` request (`cache: 'no-store'`) to `./imprint.html` and `./privacy.html`; a link appears when the answer is `ok` and its type is `text/html`. Offline or on error, the link stays hidden. The files are not in the precache (they are not in `dist/`), so the service worker never serves a stale copy.
- The links open the page in the same tab, as ordinary links.
- `.htaccess` and `web.config` answer 404 for `.caldence-deploy-files`, like for `README.txt`.
- `docs/deployment.md` gets a section on automatic deployment (setup steps above, rollback with `workflow_dispatch`) and a German imprint template with placeholders only.

## Tests

- Unit tests for `scripts/deploy-plan.mjs`: order, protected files never deleted, unsafe paths rejected, first deploy without a list.
- Component or e2e test: links hidden when the files answer 404, shown when they answer 200 with HTML.
- The deploy workflow itself runs for real at the next release; until the maintainer has set up `production`, the job fails at the missing secret without touching anything else.

## Deviation from the plan of 2026-11-08

- OpenSSH `sftp` instead of `lftp`: it is preinstalled on the runner, so the deploy job needs no `apt` (whose mirrors hung CI on 2026-11-11).
- `production` has the maintainer as required reviewer (decided 2026-11-11).

## Maintainer steps

1. `ssh-keygen -t ed25519 -C "caldence-deploy" -f caldence-deploy -N ""`
2. konsoleH: Settings → Login data → Public SFTP keys: add `caldence-deploy.pub` (if ed25519 is refused: `-t rsa -b 4096`).
3. Test: `sftp -i caldence-deploy <user>@<host>`, compare the fingerprint, `ls`.
4. Create the environment `production` with the settings above, then delete the local private key.
5. Upload `imprint.html` (and `privacy.html`) to the web folder.
