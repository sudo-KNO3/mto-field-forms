# Deployment

The app is static files in `src/`. There is no build step. GitHub Pages hosts it through the workflow in `.github/workflows/deploy.yml`.

## First-time setup

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main`, or run the **Deploy to GitHub Pages** workflow by hand. The site URL appears in the workflow summary, for example `https://<user>.github.io/mto-field-forms/`.

> GitHub Pages is free for **public** repos. A **private** repo needs a paid plan (Pro, Team or Enterprise). Either way the site URL is public, but it's unlisted. Form data never touches the server: it stays on the phone until exported.

## Releasing an update

1. Make the change and run `npm test`.
2. If you added, renamed or removed a file under `src/`, update `SHELL` in `src/sw.js` and bump `CACHE` (`mto-forms-v1` → `v2`).
3. Bump `APP_VERSION` in `src/js/export.js`, add a line to `CHANGELOG.md`, commit and push.

Phones pick up the new version the next time the app opens with signal. The service worker refreshes in the background, and the update applies on the launch after that.

## Local testing

```sh
npm start        # http://localhost:8080
npm test         # form-definition and export tests
```

iOS only allows offline mode and home-screen install over HTTPS. Test those on the Pages URL, not on a LAN IP.
