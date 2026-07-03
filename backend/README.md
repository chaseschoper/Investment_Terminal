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

Example Gmail SMTP values:

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USER=yourgmail@gmail.com`
- `SMTP_PASS=your_google_app_password`
- `SMTP_FROM=MrktRally <yourgmail@gmail.com>`

Google shows app passwords in groups with spaces. Render can store it either way; the backend removes spaces before sending.
