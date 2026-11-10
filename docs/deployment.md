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

## Updating

Overwrite all files with those of the new ZIP. Users see the "new version" prompt and can reload: on the next start, or in a tab that stays open within about an hour (and whenever the tab becomes visible again while online). Their workspace is saved before the reload.

## Apache

The included `.htaccess` sets the MIME types and cache headers. The folder needs `AllowOverride FileInfo` (the CI smoke test runs with exactly that) and `mod_mime`. `mod_headers` is optional: without it the cache headers are missing, but the app still works; updates may then be delayed by browser caches. Alternatively, copy the directives from `.htaccess` into the vhost.

## nginx

Include [`deploy/nginx.conf`](../deploy/nginx.conf) in your configuration and adjust `root` and the `/apps/caldence/` path. It sets the MIME type of `.webmanifest`, the cache headers, and `absolute_redirect off` so the redirect to the trailing slash keeps the host and port.

## IIS

`web.config` is included in the ZIP and sets the same MIME types and cache headers. The only difference: IIS cannot match the hashed `workbox-*.js` file name, so that file is served with `no-cache` instead of `immutable`.

## Security headers

`.htaccess`, `web.config` and `deploy/nginx.conf` send these headers with every response (the values are kept in [`security-headers.ts`](../security-headers.ts), and a unit test checks that the three files match it):

- `Content-Security-Policy`: the app loads only its own files and no inline scripts or styles, and it may not be shown in a frame of another site (`frame-ancestors 'none'`).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` and a `Permissions-Policy` that switches off camera, microphone, location and similar features.

The build also puts the same policy (without `frame-ancestors`, which browsers ignore there) into a `<meta>` tag of `index.html`, so a host without `mod_headers` still gets most of the protection. `README.txt` and `web.config` answer 404 on Apache (with `mod_alias`), nginx and IIS.

### HTTPS, HSTS and one host name (set by the host)

These depend on the domain, not on the app, so they are not in the ZIP. Set them in the hosting control panel:

1. **Redirect HTTP to HTTPS** for the domain.
2. **Turn on HSTS** (`Strict-Transport-Security`), for example `max-age=31536000`. Add `includeSubDomains` only when every subdomain is served over HTTPS.
3. **Use one host name.** Redirect `www.` to the bare domain (or the other way round). Each host name is a separate origin in the browser, with its own autosave data and service worker, so users would otherwise see different workspaces depending on the address they typed.

Check the result with `curl -sI http://example.com/` (expect a redirect to `https://`) and `curl -sI https://example.com/` (expect `strict-transport-security`).

## Local use

Run `python3 -m http.server` in the unzipped folder and open `http://localhost:8000/`. Opening `index.html` from the file system does not work, because service workers need a web server.

## Troubleshooting

- **500 Internal Server Error after the upload** (Apache): the folder's `AllowOverride` lacks `FileInfo`, so the `AddType` lines in `.htaccess` are not allowed. Ask the host to allow `FileInfo`, or delete `.htaccess` and set the MIME types and caching in the host's control panel, if it offers that.
- **Wrong MIME type** (the manifest or scripts are not loaded): the server ignores `.htaccess` or `web.config`. Enable `AllowOverride`, or set `application/manifest+json` for `.webmanifest` and `text/javascript` for `.js` in the server configuration.
- **Stale version after an update**: `index.html`, `sw.js` and `manifest.webmanifest` must be served with `Cache-Control: no-cache`. Check the response headers in the browser's developer tools.
- **No install button**: the page is not served over HTTPS (except on `localhost`).

## Checking a deployment

CI runs a smoke test against Apache (`httpd:2.4`) and nginx: the app starts, works offline, sends the security headers, runs without policy violations and does not serve `README.txt`, `web.config` or `.htaccess`. To run it against your own server:

```sh
DEPLOY_URLS=https://example.com/apps/caldence/ npx playwright test -c playwright.deploy.config.ts
```
