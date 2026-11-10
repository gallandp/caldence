# Security policy

## Supported versions

Only the [latest release](https://github.com/gallandp/caldence/releases/latest) gets security fixes. Caldence is a static web app: updating means replacing the files on the web server with those of the new release ZIP.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub instead: open the repository's [Security tab](https://github.com/gallandp/caldence/security) and choose **Report a vulnerability**. Please include:

- what an attacker can do, and what they need for it (for example a prepared workspace file),
- the steps or a file to reproduce it,
- the version or commit you tested.

## What to expect

- An answer within 7 days that confirms the report and says whether it is accepted.
- For an accepted report, a fix in a new release as soon as possible, usually within 30 days, and an advisory that credits you unless you prefer otherwise.
- Updates in the private report while the fix is being prepared.

## Scope

In scope: the app (code in `src/`), the release ZIP and the server configuration files it ships (`.htaccess`, `web.config`), `deploy/nginx.conf`, and the GitHub workflows of this repository.

Not in scope: the configuration of a server that hosts a copy of Caldence (HTTPS, HSTS and similar settings belong to its operator; see [docs/deployment.md](docs/deployment.md)), and problems that need an attacker who already controls the user's browser or device.

Caldence sends no data anywhere at runtime. Workspaces stay in the browser and in files the user saves, so most findings will be about files that are shared between users (workspaces, templates, regions, calendar files).
