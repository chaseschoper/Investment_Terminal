# investment-terminal
# Investment_Terminal

## Auth setup

Google sign-in needs the same OAuth client ID in both places:

- Backend Render env: `GOOGLE_CLIENT_ID`
- Frontend Vercel env: `VITE_GOOGLE_CLIENT_ID`

Password reset emails need SMTP env vars on the backend:

- `FRONTEND_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

If SMTP is not configured, reset links are logged by the backend in development.
Set `ALLOW_RESET_LINK_RESPONSE=true` only for local testing if you want the API to return reset links directly.
