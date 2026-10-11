# Procure frontend

React/TypeScript procurement workspace. See the [root README](../README.md) for setup, API configuration, buyer workflow, Streamlit usage and verification.

Run `npm run dev` for local development, `npm run build` for production output, and `npm run lint` for checks.

Vite proxies `/api` to port 8000 when `VITE_API_URL` is blank. The existing `.env` points directly to API port 8001. Restart Vite after changing environment variables.
