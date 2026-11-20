# I Love You 3000 · mini FPL league site

Live standings, prizes (Manager of the Week, Top 5, chip prizes), last-5-gameweek form, league stats,
player ownership and a page for every manager. All numbers are worked out in the browser from live
Fantasy Premier League data on every visit. Nothing is stored: no database and no server-side cache.

- `public/`: the site (plain HTML, CSS and JavaScript, no build step).
- `public/config.js`: league ID, entry fee and prize rules. Change these to change the prizes.
- `functions/api/[[path]].js`: Cloudflare Pages Function that passes requests through to the public
  FPL API (browsers can't call it directly). It keeps nothing.

## Hosting

This folder is separate from the portfolio site (which Netlify builds from the repo root).
Pushing changes under `fpl/` to `main` runs `.github/workflows/deploy-fpl.yml`, which deploys to the Cloudflare Pages project
`ilove3000-fpl` and creates it on the first run. It needs two repository secrets
(Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with the **Cloudflare Pages: Edit** permission.
- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID (shown on the Cloudflare dashboard's overview page).

## Preview locally

```sh
cd fpl
python3 dev.py   # serves the site and forwards /api to FPL
```

Then open http://localhost:8788.

## Prize rules as coded

- Manager of the Week: highest gameweek points as FPL shows them in the league table (before hits).
  Ties go to the fewest regular transfers made that gameweek; Wildcard and Free Hit weeks count as 0.
  Still tied: split. Set `motw.points` to `'net'` or `motw.tiebreak` to `'season'` in `config.js` to change this.
- Top 5 by league rank. Managers tied on a rank share the prizes for the places they cover.
- Wildcard / Free Hit: that week's score. Triple Captain: captain points ×3 (vice-captain if the captain
  didn't play). Bench Boost: points scored by the four bench players. Ties split.
