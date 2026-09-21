# Pixel Perfect Replica

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8ae92756-77aa-479b-8057-cc4976480f3a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Build statique (hébergement mutualisé PHP, ex. InfinityFree)

```sh
npm run build:static
```

Génère `dist/client/` : `index.html`, le dossier `assets/`, les icônes et un
`.htaccess` (réécriture SPA pour que les liens profonds fonctionnent au
rafraîchissement). Aucun Node.js n'est requis à l'exécution : il suffit
d'uploader le contenu de `dist/client/` dans `htdocs/`.

Pensez à définir `VITE_API_BASE_URL` (URL publique HTTPS de l'API PHP) avant le
build ; la valeur est figée dans les fichiers générés.

`npm run build` reste le build SSR habituel et n'est pas modifié.

## Déploiement sur hébergement mutualisé PHP (InfinityFree, cPanel…)

Un seul dossier à envoyer : `backend/`. Il contient l'API PHP **et** le site
statique (index.html, assets, accueil.html, service workers).

```sh
# 1. Adresse publique de l'API (figée dans le build)
#    même domaine que le site => une adresse relative suffit
echo "VITE_API_BASE_URL=/api" > .env.production
echo "VITE_DEMO_MODE=false" >> .env.production

# 2. Build statique + copie dans backend/public/
npm run deploy:php
```

Contenu obtenu dans `backend/public/` : `index.php` (API), `index.html` (app
React), `accueil.html` (page d'accueil publique), `assets/`, `sw.js`,
`push-sw.js`, icônes, et le `.htaccess` qui envoie `/api/...` vers PHP et tout
le reste vers `index.html`.

Upload : copier le contenu de `backend/` dans `htdocs/`. Les dossiers `config/`,
`sql/` et `storage/` restent inaccessibles grâce à leurs `.htaccess`
« Require all denied ». Ne pas ré-importer `schema.sql` ni `seed_demo.sql` sur
une base existante.

### Notifications push (PHP uniquement, sans Node.js)

```sh
php backend/tools/generate_vapid_keys.php   # une seule fois
# coller le bloc 'vapid' => [...] dans backend/config/config.php
mysql -u root -p building29 < backend/sql/migrations/2026_09_17_push_subscriptions.sql
```

L'envoi est fait par `backend/src/Support/WebPush.php` (VAPID ES256 +
chiffrement aes128gcm avec les extensions `openssl` et `curl`). Aucun service
externe, aucun serveur Node. Les notifications push exigent HTTPS.
