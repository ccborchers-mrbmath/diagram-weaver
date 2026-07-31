import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RepoSummary = { fullName: string; private: boolean; defaultBranch: string };
export type SvgFile = { path: string; sha: string };

export const githubStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnection } = await import("./github/store.server");
    const conn = await getConnection(context.userId);
    return conn
      ? { connected: true as const, login: conn.login, avatarUrl: conn.avatarUrl }
      : { connected: false as const, login: null, avatarUrl: null };
  });

export const startGithubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    if (!clientId) {
      throw new Error("GitHub is not configured yet: missing GITHUB_OAUTH_CLIENT_ID.");
    }
    const request = getRequest();
    if (!request) throw new Error("Connect must start from an app request.");
    const origin = new URL(request.url).origin;
    const state = crypto.randomUUID();
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", `${origin}/github/callback`);
    url.searchParams.set("scope", "repo");
    url.searchParams.set("state", state);
    return { authorizeUrl: url.toString(), state };
  });

export const completeGithubConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("GitHub is not configured yet: missing OAuth client credentials.");
    }
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: data.code }),
    });
    const body = (await res.json()) as { access_token?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      throw new Error(body.error_description ?? "GitHub did not return an access token.");
    }
    const { githubFetch, saveConnection } = await import("./github/store.server");
    const me = await githubFetch<{ login: string; avatar_url: string }>(
      body.access_token,
      "/user",
    );
    await saveConnection(context.userId, body.access_token, me.login, me.avatar_url);
    return { login: me.login, avatarUrl: me.avatar_url };
  });

export const disconnectGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteConnection } = await import("./github/store.server");
    await deleteConnection(context.userId);
    return { ok: true };
  });

export const listRepos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RepoSummary[]> => {
    const { githubFetch, requireToken } = await import("./github/store.server");
    const token = await requireToken(context.userId);
    const repos = await githubFetch<
      { full_name: string; private: boolean; default_branch: string }[]
    >(token, "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member");
    return repos.map((r) => ({
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
    }));
  });

export const listBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { repo: string }) =>
    z.object({ repo: z.string().regex(/^[^/]+\/[^/]+$/) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<string[]> => {
    const { githubFetch, requireToken } = await import("./github/store.server");
    const token = await requireToken(context.userId);
    const branches = await githubFetch<{ name: string }[]>(
      token,
      `/repos/${data.repo}/branches?per_page=100`,
    );
    return branches.map((b) => b.name);
  });

export const listSvgFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { repo: string; branch: string }) =>
    z
      .object({ repo: z.string().regex(/^[^/]+\/[^/]+$/), branch: z.string().min(1) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<SvgFile[]> => {
    const { githubFetch, requireToken } = await import("./github/store.server");
    const token = await requireToken(context.userId);
    const tree = await githubFetch<{
      tree: { path: string; type: string; sha: string }[];
      truncated: boolean;
    }>(
      token,
      `/repos/${data.repo}/git/trees/${encodeURIComponent(data.branch)}?recursive=1`,
    );
    return tree.tree
      .filter((n) => n.type === "blob" && n.path.toLowerCase().endsWith(".svg"))
      .map((n) => ({ path: n.path, sha: n.sha }));
  });

export const readSvgFile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { repo: string; branch: string; path: string }) =>
    z
      .object({
        repo: z.string().regex(/^[^/]+\/[^/]+$/),
        branch: z.string().min(1),
        path: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { githubFetch, requireToken } = await import("./github/store.server");
    const token = await requireToken(context.userId);
    const file = await githubFetch<{ content: string; encoding: string; sha: string }>(
      token,
      `/repos/${data.repo}/contents/${encodePath(data.path)}?ref=${encodeURIComponent(data.branch)}`,
    );
    const content = Buffer.from(file.content, "base64").toString("utf8");
    return { content, sha: file.sha };
  });

export const commitSvgFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      repo: string;
      branch: string;
      path: string;
      content: string;
      message: string;
      sha: string;
    }) =>
      z
        .object({
          repo: z.string().regex(/^[^/]+\/[^/]+$/),
          branch: z.string().min(1),
          path: z.string().min(1),
          content: z.string().max(2_000_000),
          message: z.string().min(1).max(500),
          sha: z.string().min(1),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { githubFetch, requireToken } = await import("./github/store.server");
    const token = await requireToken(context.userId);
    const result = await githubFetch<{ content: { sha: string } }>(
      token,
      `/repos/${data.repo}/contents/${encodePath(data.path)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: data.message,
          content: Buffer.from(data.content, "utf8").toString("base64"),
          branch: data.branch,
          sha: data.sha,
        }),
      },
    );
    return { sha: result.content.sha };
  });

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
