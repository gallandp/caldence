# Deploying Caldence

Caldence is a static site. The release ZIP contains the files of `dist/` at its root, including `.htaccess`, `web.config` and `README.txt`. All paths are relative, so the app works in any folder of a server, for example `/apps/caldence/`, with or without the trailing slash.

## Requirements

- Any static web server. No server-side code, database or credentials are needed.
- HTTPS to install the app and use the offline mode. `http://localhost` works without it.

## Plain webspace, step by step

1. Download the latest `caldence-<version>.zip` from the [releases page](https://github.com/gallandp/caldence/releases).
2. Unzip it on your computer.
3. Upload all files to the folder of your webspace, by SFTP or the provider's file manager. Make sure the hidden file `.htaccess` is uploaded too (enable "show hidden files" in your client).
4. Open the folder's address in your browser.

## Checking the download

Every release has a `caldence-<version>.zip.sha256` next to the ZIP and a build provenance attestation, which proves the ZIP was built by this repository's release workflow from the tagged commit.

```sh
sha256sum -c caldence-<version>.zip.sha256
gh attestation verify caldence-<version>.zip --repo gallandp/caldence
```

## Updating

Overwrite all files with those of the new ZIP. Users see the "new version" prompt and can reload: on the next start, or in a tab that stays open within about an hour (and whenever the tab becomes visible again while online). Their workspace is saved before the reload.

## Apache

The included `.htaccess` sets the MIME types and cache headers. The folder needs `AllowOverride FileInfo` (the CI smoke test runs with exactly that) and `mod_mime`. `mod_headers` is optional: without it the cache headers are missing, but the app still works; updates may then be delayed by browser caches. Alternatively, copy the directives from `.htaccess` into the vhost.

## nginx

Include [`deploy/nginx.conf`](../deploy/nginx.conf) in your configuration and adjust `root` and the `/apps/caldence/` path. It sets the MIME type of `.webmanifest`, the cache headers, and `absolute_redirect off` so the redirect to the trailing slash keeps the host and port.

## IIS

`web.config` is included in the ZIP and sets the same MIME types and cache headers. The only difference: IIS cannot match the hashed `workbox-*.js` file name, so that file is served with `no-cache` instead of `immutable`.

## Local use

Run `python3 -m http.server` in the unzipped folder and open `http://localhost:8000/`. Opening `index.html` from the file system does not work, because service workers need a web server.

## Troubleshooting

- **500 Internal Server Error after the upload** (Apache): the folder's `AllowOverride` lacks `FileInfo`, so the `AddType` lines in `.htaccess` are not allowed. Ask the host to allow `FileInfo`, or delete `.htaccess` and set the MIME types and caching in the host's control panel, if it offers that.
- **Wrong MIME type** (the manifest or scripts are not loaded): the server ignores `.htaccess` or `web.config`. Enable `AllowOverride`, or set `application/manifest+json` for `.webmanifest` and `text/javascript` for `.js` in the server configuration.
- **Stale version after an update**: `index.html`, `sw.js` and `manifest.webmanifest` must be served with `Cache-Control: no-cache`. Check the response headers in the browser's developer tools.
- **No install button**: the page is not served over HTTPS (except on `localhost`).

## Checking a deployment

CI runs a smoke test against Apache (`httpd:2.4`) and nginx. To run it against your own server:

```sh
DEPLOY_URLS=https://example.com/apps/caldence/ npx playwright test -c playwright.deploy.config.ts
```
