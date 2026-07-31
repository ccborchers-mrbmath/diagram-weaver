import { decryptToken, encryptToken } from "./crypto.server";

export type GithubConnection = {
  token: string;
  login: string | null;
  avatarUrl: string | null;
};

export async function saveConnection(
  userId: string,
  token: string,
  login: string | null,
  avatarUrl: string | null,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("github_connections").upsert(
    {
      user_id: userId,
      access_token_ciphertext: encryptToken(token),
      github_login: login,
      github_avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function getConnection(userId: string): Promise<GithubConnection | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("github_connections")
    .select("access_token_ciphertext, github_login, github_avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    token: decryptToken(data.access_token_ciphertext),
    login: data.github_login,
    avatarUrl: data.github_avatar_url,
  };
}

export async function deleteConnection(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("github_connections").delete().eq("user_id", userId);
  if (error) throw error;
}

/** Authenticated GitHub REST call. Throws with the provider status + body. */
export async function githubFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "svg-diagram-editor",
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`GitHub request failed [${res.status}] ${path}: ${text}`);
    let message = text;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      /* keep raw text */
    }
    throw new Error(`GitHub error ${res.status}: ${message}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Requires the connection to exist; returns the decrypted token. */
export async function requireToken(userId: string): Promise<string> {
  const conn = await getConnection(userId);
  if (!conn) throw new Error("GitHub is not connected for this account.");
  return conn.token;
}
