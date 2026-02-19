Deploy the current web prototype to the maps repo for a GitHub Pages preview.

## What this does

Syncs `web/` source files into `~/dev/maps/rgs/page/` and `data/campsites.json`
into `~/dev/maps/rgs/data/`, then commits and pushes to origin/main.
GitHub Actions (`combined-deploy.yaml`) will rebuild and publish to GitHub Pages automatically.

## Steps

### 1. Gate: verify the local build is clean

Run both checks from the `web/` directory. **Stop and report the failure if either fails.**

```
cd ~/dev/robot-geographical-society/web
npm test -- --run
npm run lint
```

### 2. Sync web source files to rgs/page

Use rsync to copy everything from `web/` into `~/dev/maps/rgs/page/`,
deleting files in the destination that no longer exist in the source —
but preserving the one maps-specific file that must NOT be overwritten:

- `vite.config.js` — hardcodes `base: '/maps/rgs/'` required for GitHub Pages

```
rsync -av --delete \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='vite.config.js' \
  ~/dev/robot-geographical-society/web/ \
  ~/dev/maps/rgs/page/
```

### 3. Sync campsites data

The app imports campsites from `../../data/campsites.json` relative to `rgs/page/src/`,
which resolves to `rgs/data/campsites.json`. Copy the compiled GeoJSON there.

```
mkdir -p ~/dev/maps/rgs/data
cp ~/dev/robot-geographical-society/data/campsites.json ~/dev/maps/rgs/data/campsites.json
```

### 4. Commit and push

Stage all changes under `rgs/` in the maps repo, commit, and push.
Use the short git hash of the source repo as the reference.

```
cd ~/dev/maps
SOURCE_SHA=$(git -C ~/dev/robot-geographical-society rev-parse --short HEAD)
git add rgs/
git commit -m "preview: sync rgs from robot-geographical-society@${SOURCE_SHA}"
git push origin main
```

After the push, GitHub Actions will run `combined-deploy.yaml` and publish the
updated site. Check progress at: https://github.com/tommyroar/maps/actions
