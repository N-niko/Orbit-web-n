# Orbit

Orbit brings campus conversations, roommate planning, shared expenses, events, and student profiles into one place. This is a full stack Next.js application with a Supabase PostgreSQL backend and email/password authentication, ready to open in VS Code and deploy to Vercel.

![Orbit dashboard preview](docs/orbit-desktop.jpg)

## Run locally

Use Node.js **22.13 or newer** and npm. Open this folder in VS Code, then run:

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Login is the landing page. Choose **Try the demo** from either the login or sign-up screen to explore Alex Morgan’s fictional campus, friends, posts, tasks, and events without an account. Demo changes stay in memory and reset when you leave or refresh; the demo never loads or writes real account data. **Back to log in** exits the preview. Connect Supabase below to enable real accounts and one-time account setup.

To check or run a production build:

```bash
npm run typecheck
npm test
npm run test:db
npm run build
npm start
```

`npm start` serves the build created by `npm run build`. `npm run dev` is for editing with live reload.

## Connect the backend

1. Create a [Supabase project](https://supabase.com/dashboard).
2. Open the project’s SQL Editor. Run the entire [initial migration](supabase/migrations/202610180001_orbit.sql) once against a new project, then [account onboarding](supabase/migrations/20261019233742_account_onboarding.sql). Existing Orbit databases only need the onboarding migration. These create the tables, access rules, account initialization trigger, database functions, and private photo bucket. Run migrations in filename order, once each.
3. Copy `.env.example` to `.env.local` and enter your project values:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
   ```

   The variable is named `ANON_KEY` for compatibility; a Supabase public publishable key is also accepted. Use the public project key, never a service-role or secret key. Public keys are intended for browser use, while database policies enforce access. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
4. In Supabase **Authentication → URL Configuration**, set the local Site URL to `http://localhost:3000` and add both `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/recovery` to allowed redirect URLs. Keep the Email provider enabled. This app uses the default confirmation email flow and exchanges its PKCE code at `/auth/callback`; no custom email template is required. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
5. Restart the development server. Choose **Create an account** and enter your name, any valid email, password, major, and graduation year. Passwords require at least 8 characters, an uppercase letter, a number, and a non-whitespace special character. The signup API checks these rules on the server. Also configure Supabase Auth's password-strength settings so direct Auth API calls have equivalent protection (its strongest built-in character option also requires lowercase).
6. If email confirmation is enabled, open the confirmation link in the same browser. Complete campus-life setup (commuter, or resident with a required hall), then optionally upload a JPG/PNG/WebP photo up to 5 MB. Existing accounts also complete these new setup steps once. Progress is stored in the database; completed accounts go straight to the dashboard on future logins. Email confirmation and password recovery for ordinary users require a configured SMTP provider; Supabase's default mail service is restricted to organization team addresses.

Residence halls follow [Caldwell’s official list](https://www.caldwell.edu/residence-life/residence-halls/): Mother Joseph Residence Hall, Dominican Hall, and Rosary Hall. Residency is self-reported and does not grant extra access. Workspace membership still controls shared profiles, tasks, bills, and photos. Verified residence-based permissions are a later feature. The photo bucket is private; signed URLs last one hour and profiles use initials if a photo cannot load.

New accounts begin with an empty workspace called “My Orbit.” Create a workspace or copy its invite code from the roommate workspace settings. Another signed-in user can enter that code to join. Copying a code does not send an email or invitation. Joining or creating a workspace switches the active workspace; all activity shown belongs to the active workspace.

If you already use the Supabase CLI, you can apply the checked-in migration to a linked project with `supabase db push` instead of the SQL Editor. Do not apply it twice to the same database.

## Push to GitHub and deploy

1. This folder has its own local Git repository on `codex/orbit-web`. Create an initial commit in VS Code’s Source Control, then choose **Publish to GitHub**, or push it to a repository you create. No remote is configured yet. Commit `package-lock.json` and `.env.example`; `.env.local`, dependencies, and build output are ignored.
2. In Vercel, choose **Add New → Project**, import the repository, and keep the **Next.js** framework preset. The project root is this folder. Use `npm ci` to install and `npm run build` to build; leave the output directory at its default. See [Vercel Git deployments](https://vercel.com/docs/git) and [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).
3. Add the two environment variables above to the Vercel project. Add variables to each environment you intend to use. Changes to environment variables require a new deployment. See [Vercel environment variables](https://vercel.com/docs/environment-variables).
4. In Supabase, set **Site URL** to your actual HTTPS production origin (for example, `https://your-orbit.vercel.app`) and add both `https://YOUR_DOMAIN/auth/callback` and `https://YOUR_DOMAIN/auth/recovery` to allowed redirect URLs. Keep the localhost callback if you will continue local development. Add specific preview callbacks only for preview deployments you intend to use.
5. Deploy, then test sign-up, confirmation, sign-in, creating an item, refreshing, and joining a workspace from a second account. Database setup must be completed separately from the Vercel deployment.

No GitHub repository, Supabase project, or Vercel deployment is created by this source code alone.

## Project structure

| Location | Purpose |
| --- | --- |
| `src/app` | Next.js App Router pages, authentication callback, and API routes |
| `src/components` | Responsive dashboard, feed, roommate, event, campus, and profile interfaces |
| `src/lib/types.ts` | Shared data and action contracts |
| `src/lib/demo.ts` | Fictional sample data and local demo state updates |
| `src/lib/supabase` | Browser and server Supabase clients |
| `src/lib/server` | Request validation and API response helpers |
| `supabase/migrations` | Database schema, policies, and authenticated RPCs |

`GET /api/orbit` loads the signed-in account’s active workspace. `POST /api/orbit` validates an action and executes an authenticated database transaction, returning updated data. Shared types describe the actions. Private responses use `no-store`; workspace membership is enforced in the database. Accounts can read shared profiles and activity only within workspaces they belong to. Task and expense deletion is limited to their creator; other workspace members can complete tasks.

## Current scope

- Campus feed with general posts, questions, marketplace posts, likes, and comments.
- Shared tasks and groceries with assignees, due dates, and completion.
- Expense tracking with equal split estimates across current workspace members.
- Event creation, categories, and RSVP tracking.
- Student profiles and workspace creation or joining by code.
- Login landing page and one-time profile, housing, and optional photo setup.

Expense balances are tracking estimates, and no money is transferred. Campus posts and events are member-created; Orbit has no university systems integration. The app does not send workspace invitations, direct messages, calendar invitations, or push notifications. Updates load on actions and refresh; shared data also refreshes every 30 seconds while the tab is visible; there is no realtime subscription. This version uses one active workspace at a time and does not include a workspace switcher or invite-code rotation.

## Verification

`npm test` checks demo behavior and server validation. `npm run test:db` runs the actual migration and access assertions in disposable local PostgreSQL (PGlite), including workspace isolation, invite joins, identity checks, shared updates, and creator-only deletion. It uses an auth shim and does not connect to your Supabase project. After connecting Supabase, also test confirmation, password recovery, and two-account collaboration against your own project.

## Troubleshooting

- **Accounts are unavailable:** confirm the Supabase environment values, restart locally or redeploy on Vercel, and sign in.
- **A database function is missing:** run the migration in the same Supabase project referenced by your environment variables.
- **Email returns to the wrong domain:** check the Supabase Site URL and allowed callback URL, then request a new confirmation email. Confirm that the deployed environment variables match the deployment.
- **An invite code fails:** copy all 12 letters/numbers from a real workspace. Demo codes cannot connect real accounts.

Platform setup references were checked against the linked official documentation on October 18, 2026.
