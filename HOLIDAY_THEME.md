# MrktRally holiday theme

The Christmas presentation is reversible and does not overwrite the standard MrktRally artwork.

## Switch back to the standard site

The holiday theme is enabled by default unless this Vite environment variable is set:

```bash
VITE_HOLIDAY_THEME=false
```

Set that variable on both frontend deployments and rebuild/redeploy. This restores the normal logo, removes the lights and snowfall, and removes all seasonal accents without deleting code or assets.

For a permanent code-level switch, change this line near the top of both `frontend/src/App.jsx` and `The frontend/src/App.jsx`:

```js
const HOLIDAY_THEME_ENABLED = false;
```

## Seasonal assets

- Website logo: `frontend/public/holiday/mrktrally-christmas-logo.png`
- Alternate frontend logo: `The frontend/public/holiday/mrktrally-christmas-logo.png`
- X profile image: `holiday-assets/mrktrally-christmas-logo-x.png`
- X banner: `holiday-assets/mrktrally-christmas-x-banner-1500x500.png`
- Full-resolution source images remain in `holiday-assets/`.

The original `/mrktrally-icon.png` and existing social assets remain unchanged.
