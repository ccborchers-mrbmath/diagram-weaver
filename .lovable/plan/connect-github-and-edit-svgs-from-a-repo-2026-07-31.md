# Connect GitHub and edit SVGs from a repo

Yes, this is possible. Each teacher signs into the app, authorizes their own GitHub account once, browses their repos for `.svg` files, opens one in the editor, and commits changes back with a "Commit" button.

There is no ready-made per-user GitHub connector in this workspace, so the app needs its own GitHub OAuth app. That means one setup step from you: create a GitHub OAuth app and paste its Client ID and Client Secret when I ask for them (I'll give the exact redirect URL to register).

## What gets built

**1. Accounts (Lovable Cloud)**
- Email/password + Google sign-in on a public `/auth` page.
- The editor stays usable without signing in; GitHub features require sign-in.

**2. Connect GitHub**
- A "GitHub" section in the code panel header: `Connect GitHub` when not linked, otherwise the account handle plus `Disconnect`.
- Clicking connect opens a popup to GitHub's consent screen (`repo` scope so private repos work), returns to a callback route, and the access token is exchanged and stored server-side, encrypted, keyed to the signed-in user. The token never reaches the browser.

**3. Open a file from a repo**
- "Open file" becomes a menu: `From this computer` (existing behaviour) and `From GitHub`.
- A dialog lists the user's repos (searchable), then the branch, then a file tree filtered to `.svg` files. Picking one loads its contents into the canvas and code editor.
- The header shows `owner/repo · branch · path` instead of a local filename.

**4. Commit changes**
- A `Commit` button next to Download, enabled when the editor content differs from what was loaded.
- Opens a small dialog with an optional message (default: `Update <filename> via Diagram Editor`), commits to the same branch and path, and stores the new file SHA so subsequent commits work.
- If the file changed on GitHub since it was opened, the commit is rejected and the user is told to reload the file — no silent overwrite.
- Local files keep their current autosave behaviour; GitHub files are commit-on-demand.

## Technical notes

- **Auth/storage**: Lovable Cloud (Supabase). One server-only table `github_connections` (user_id, encrypted access token, github login, timestamps) with RLS and `service_role`-only grants; read/written only by server functions using the admin client.
- **OAuth**: GitHub OAuth web flow. `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` stored as project secrets; token exchange happens in a server route. Callback route: `/api/public/github/callback` (registered as the OAuth app's authorization callback URL), which hands a one-time code to a server function that stores the token; the popup posts a same-origin completion message and closes.
- **Token encryption**: AES-256-GCM in a server-only helper using a generated `GITHUB_TOKEN_SECRET`.
- **GitHub calls**: all via `createServerFn` with `requireSupabaseAuth` — `GET /user`, `GET /user/repos`, `GET /repos/{o}/{r}/branches`, `GET /repos/{o}/{r}/git/trees/{branch}?recursive=1` (filtered to `.svg`), `GET`/`PUT /repos/{o}/{r}/contents/{path}` (base64, with `sha` for updates). Only UI-safe fields returned to the client.
- **UI**: shadcn `Dialog`, `Command` (repo/file search), `DropdownMenu` for the Open file split, `sonner` toasts for errors surfaced from GitHub's status/body.
- **Files**: `src/routes/auth.tsx`, `src/routes/api/public/github/callback.ts`, `src/lib/github/*.functions.ts`, `src/server/githubConnections.server.ts`, `src/components/editor/GitHubPicker.tsx`, `src/components/editor/GitHubBar.tsx`; `src/routes/index.tsx` and `src/lib/useFileSync.ts` updated for the two file sources.
- Also fixing an unrelated hydration warning from locale number formatting in the code-panel header.

## Setup you'll need to do

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Homepage URL: your published app URL. Authorization callback URL: the callback URL above (I'll give the exact string).
3. Paste the Client ID and Client Secret into the secure form I open.
