# Security Policy

RiskCalculator is a public, client-side application. Treat every `VITE_*`
value as public, and never place provider secrets, database passwords, service
role keys, or Supabase secret keys in frontend code, Git history, GitHub Pages,
or screenshots.

## Supported Version

Security fixes are made on `main` and released through GitHub Pages after CI
passes.

## Report a Vulnerability

Open a private GitHub security advisory for this repository. If that is not
available, contact the repository owner directly before publishing details.

Please include:

- affected URL, route, table, function, or workflow;
- reproduction steps;
- expected versus actual behavior;
- whether user data, tokens, or secrets may be exposed.

## Supabase Boundaries

- Frontend code may use only `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` / publishable keys.
- `SUPABASE_SECRET_KEY`, `service_role`, database passwords, and provider keys
  belong only in secure server-side secret stores.
- User data is protected by Row Level Security. Any new public-schema table
  must enable RLS and define explicit policies before browser access is
  granted.
- GitHub Pages builds must receive only public Supabase values.

## Manual Production Checks

Before deploying auth changes, verify in Supabase Auth URL Configuration:

- Site URL: `https://ignacior04.github.io/RiskCalculator/`
- Redirect URLs:
  - `https://ignacior04.github.io/RiskCalculator/`
  - `http://localhost:5173/`
  - `http://127.0.0.1:5173/`
  - `http://127.0.0.1:4173/`

Email/password signups should require email confirmation, and anonymous sign-in
should remain disabled.
