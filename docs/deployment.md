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

## Imprint and privacy page

Caldence never ships an imprint or a privacy page, because they belong to whoever runs the server. Put them next to the app yourself:

- `imprint.html` (in Germany required for most public websites as "Impressum")
- `privacy.html` (optional)

When a file is there, the sidebar shows the link "Impressum" / "Imprint" or "Datenschutz" / "Privacy". The app checks at every start and shows no link offline. Updating the app never overwrites or deletes the two files, whether you upload by hand (just do not delete them) or with the automatic deployment below.

A minimal template (replace every value in square brackets; check with a lawyer what your case needs):

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Impressum</title>
  </head>
  <body>
    <h1>Impressum</h1>
    <p>Angaben gemäß § 5 DDG</p>
    <p>[Name]<br />[Straße Hausnummer]<br />[PLZ Ort]</p>
    <h2>Kontakt</h2>
    <p>E-Mail: [adresse@example.com]</p>
    <h2>Verantwortlich für den Inhalt</h2>
    <p>[Name, Anschrift wie oben]</p>
    <p><a href="./">Zurück zu Caldence</a></p>
  </body>
</html>
```

The security headers of `.htaccess` also apply to these pages: no inline styles or scripts. Use a separate `.css` file next to them if you want styling.

## Automatic deployment by SFTP (maintainers)

The workflow `.github/workflows/deploy.yml` uploads a published release to a webspace by SFTP. `release.yml` starts it after every release; it can also be started by hand under Actions → Deploy → Run workflow with any published version, for a rollback.

How the credentials stay private:

- The private key is a secret of the GitHub environment `production`. Only the branch `main` may use it, and every run waits until a required reviewer approves it. Pull requests and forks never get it.
- The deploy job runs no npm and no third-party action. It downloads the published ZIP, checks its checksum and that its build attestation comes from `release.yml` on `main`, and uploads it with OpenSSH `sftp`.
- The server's host key is pinned, so the connection fails if another server answers.

What it does: it uploads all files, then `index.html`, `sw.js` and `manifest.webmanifest`, then the list of uploaded files (`.caldence-deploy-files`, not served from this version on). Files of the previous release that the new one no longer has stay for one more deployment, so browsers still running the previous version keep working; the deployment after that deletes them. Other files in the folder, including `imprint.html` and `privacy.html`, are never touched. A smoke test with the tests of the deployed version then checks the live site.

### Setting it up

1. Create a key pair just for deploying, without passphrase:
   ```sh
   ssh-keygen -t ed25519 -C "caldence-deploy" -f caldence-deploy -N ""
   ```
2. Add `caldence-deploy.pub` to the SFTP user of the webspace. At Hetzner: konsoleH → Settings → Login data → Public SFTP keys (keys work only for the main FTP user; if ed25519 is refused, create the key with `-t rsa -b 4096`).
3. Test it: `sftp -i caldence-deploy <user>@<host>`, compare the fingerprint with the one the host shows, and run `ls`.
4. Pin the host key: `ssh-keyscan -t ed25519 <host>` and check that its fingerprint (`ssh-keyscan -t ed25519 <host> | ssh-keygen -lf -`) matches step 3.
5. In GitHub: Settings → Environments → `production` (GitHub creates it without protection at the first deploy run; otherwise New environment). Set the protection first, then the secret:
   - Required reviewers: yourself.
   - Deployment branches and tags: Selected branches, `main`.
   - Environment secret `SFTP_PRIVATE_KEY`: the whole content of `caldence-deploy`.
   - Environment secret `SFTP_USER`: the SFTP user name (not a credential, but GitHub then hides it in logs).
   - Environment variables: `SFTP_HOST`, `SFTP_PATH` (the web folder, for example `public_html`) and `SFTP_KNOWN_HOSTS` (the line from step 4).
6. Delete the private key file from your computer.

If the key may have leaked, delete it at the host first, then create a new one.

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
