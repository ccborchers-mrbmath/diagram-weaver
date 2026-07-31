import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeGithubConnect } from "@/lib/github.functions";

export const Route = createFileRoute("/github/callback")({
  head: () => ({
    meta: [
      { title: "Finishing GitHub connection" },
      { name: "description", content: "Completing the GitHub authorization for your account." },
      { property: "og:title", content: "Finishing GitHub connection" },
      {
        property: "og:description",
        content: "Completing the GitHub authorization for your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GithubCallback,
});

const STATE_KEY = "github-oauth-state";

function GithubCallback() {
  const [message, setMessage] = useState("Finishing the GitHub connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (type: "githubConnectComplete" | "githubConnectFailed", error?: string) => {
      window.opener?.postMessage({ type, error }, window.location.origin);
      window.close();
    };

    const error = params.get("error_description") ?? params.get("error");
    if (error) {
      setMessage(error);
      notify("githubConnectFailed", error);
      return;
    }

    const code = params.get("code");
    const state = params.get("state");
    const expected = window.localStorage.getItem(STATE_KEY);
    window.localStorage.removeItem(STATE_KEY);
    if (!code) {
      setMessage("GitHub did not return an authorization code.");
      notify("githubConnectFailed", "Missing authorization code.");
      return;
    }
    if (expected && state !== expected) {
      setMessage("The authorization response didn't match this browser session.");
      notify("githubConnectFailed", "State mismatch.");
      return;
    }

    void completeGithubConnect({ data: { code } })
      .then(() => notify("githubConnectComplete"))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Could not finish the connection.";
        setMessage(msg);
        notify("githubConnectFailed", msg);
      });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="max-w-md text-center text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
