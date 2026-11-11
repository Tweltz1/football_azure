# weltzcraft.com

The Weltzcraft Studios website: the apps showcase, custom app-building services, a project brief form
(builds an email to hello@weltzcraft.com, no server) and per-app support addresses.

Plain static files, no build step. Preview: `python3 -m http.server -d weltzcraft-site 8000`.

Deploys to Cloudflare Pages project `weltzcraft` on every push to `main` that touches this folder
(`.github/workflows/deploy-weltzcraft-site.yml`), which also attaches weltzcraft.com and www.

App icons in `img/` are copied from each app's own icon (see the app branches in the repo).
When an app's status changes (e.g. it reaches the App Store), update its chip and link in `index.html`.
