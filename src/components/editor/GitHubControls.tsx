import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Github, GitCommitVertical, Loader2, LogOut, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import {
  commitSvgFile,
  disconnectGithub,
  githubStatus,
  listBranches,
  listRepos,
  listSvgFiles,
  readSvgFile,
  startGithubConnect,
} from "@/lib/github.functions";

export type GithubFile = {
  repo: string;
  branch: string;
  path: string;
  sha: string;
  /** Content as loaded from (or last committed to) GitHub. */
  baseline: string;
};

type Props = {
  svg: string;
  file: GithubFile | null;
  onFileChange: (file: GithubFile | null) => void;
  onLoadSvg: (text: string) => void;
};

const STATE_KEY = "github-oauth-state";

function waitForPopup(popup: Window) {
  return new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup) return;
      const type = (event.data as { type?: string; error?: string })?.type;
      if (type !== "githubConnectComplete" && type !== "githubConnectFailed") return;
      cleanup();
      if (type === "githubConnectComplete") resolve();
      else reject(new Error((event.data as { error?: string }).error ?? "GitHub connect failed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The GitHub window closed before finishing."));
    }, 500);
  });
}

export function GitHubControls({ svg, file, onFileChange, onLoadSvg }: Props) {
  const { user, loading } = useSession();
  const queryClient = useQueryClient();
  const callStatus = useServerFn(githubStatus);
  const callStart = useServerFn(startGithubConnect);
  const callDisconnect = useServerFn(disconnectGithub);
  const callRead = useServerFn(readSvgFile);
  const callCommit = useServerFn(commitSvgFile);

  const [connecting, setConnecting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);

  const status = useQuery({
    queryKey: ["github-status", user?.id],
    queryFn: () => callStatus(),
    enabled: !!user,
  });

  const connected = status.data?.connected === true;
  const dirty = !!file && svg !== file.baseline;

  const connect = async () => {
    const popup = window.open("", "github-oauth", "width=720,height=800");
    if (!popup) {
      toast.error("Allow popups for this site, then try connecting again.");
      return;
    }
    setConnecting(true);
    try {
      const { authorizeUrl, state } = await callStart();
      window.localStorage.setItem(STATE_KEY, state);
      const done = waitForPopup(popup);
      popup.location.href = authorizeUrl;
      await done;
      await queryClient.invalidateQueries({ queryKey: ["github-status"] });
      toast.success("GitHub connected");
    } catch (e) {
      popup.close();
      toast.error(e instanceof Error ? e.message : "Could not connect GitHub.");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      await callDisconnect();
      onFileChange(null);
      await queryClient.invalidateQueries({ queryKey: ["github-status"] });
      toast.success("GitHub disconnected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect GitHub.");
    }
  };

  const openFile = useCallback(
    async (repo: string, branch: string, path: string) => {
      try {
        const { content, sha } = await callRead({ data: { repo, branch, path } });
        onLoadSvg(content);
        onFileChange({ repo, branch, path, sha, baseline: content });
        setPickerOpen(false);
        toast.success(`Opened ${path}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not open that file.");
      }
    },
    [callRead, onFileChange, onLoadSvg],
  );

  const commit = async (message: string) => {
    if (!file) return;
    try {
      const { sha } = await callCommit({
        data: {
          repo: file.repo,
          branch: file.branch,
          path: file.path,
          content: svg,
          message,
          sha: file.sha,
        },
      });
      onFileChange({ ...file, sha, baseline: svg });
      setCommitOpen(false);
      toast.success("Committed to GitHub");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Commit failed.";
      toast.error(
        msg.includes("409") || msg.toLowerCase().includes("does not match")
          ? "This file changed on GitHub since you opened it. Re-open it to get the latest version."
          : msg,
      );
    }
  };

  if (loading) return null;

  if (!user) {
    return (
      <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs">
        <Link to="/auth">
          <Github className="h-3.5 w-3.5" />
          Sign in for GitHub
        </Link>
      </Button>
    );
  }

  return (
    <>
      {!connected ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={connect}
          disabled={connecting || status.isLoading}
          title="Authorize GitHub so you can open and commit SVGs in your repos"
        >
          {connecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Github className="h-3.5 w-3.5" />
          )}
          Connect GitHub
        </Button>
      ) : (
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setPickerOpen(true)}
            title="Open an SVG from one of your GitHub repositories"
          >
            <Github className="h-3.5 w-3.5" />
            Open from GitHub
          </Button>
          <Button
            variant={dirty ? "default" : "outline"}
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setCommitOpen(true)}
            disabled={!dirty}
            title={file ? "Commit your changes to GitHub" : "Open a GitHub file first"}
          >
            <GitCommitVertical className="h-3.5 w-3.5" />
            Commit
          </Button>
        </>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 max-w-[130px] px-2 text-xs">
            <span className="truncate">{status.data?.login ?? user.email}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {connected && (
            <DropdownMenuItem onClick={disconnect}>
              <Unplug className="mr-2 h-3.5 w-3.5" />
              Disconnect GitHub
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={async () => {
              await queryClient.cancelQueries();
              queryClient.clear();
              onFileChange(null);
              await supabase.auth.signOut();
            }}
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <GitHubPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={openFile} />
      <CommitDialog
        open={commitOpen}
        onOpenChange={setCommitOpen}
        fileName={file?.path.split("/").pop() ?? "diagram.svg"}
        onCommit={commit}
      />
    </>
  );
}

function GitHubPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (repo: string, branch: string, path: string) => Promise<void>;
}) {
  const callRepos = useServerFn(listRepos);
  const callBranches = useServerFn(listBranches);
  const callFiles = useServerFn(listSvgFiles);

  const [repo, setRepo] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!open) {
      setRepo(null);
      setBranch(null);
    }
  }, [open]);

  const repos = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => callRepos(),
    enabled: open,
  });
  const branches = useQuery({
    queryKey: ["github-branches", repo],
    queryFn: () => callBranches({ data: { repo: repo! } }),
    enabled: open && !!repo,
  });
  const files = useQuery({
    queryKey: ["github-files", repo, branch],
    queryFn: () => callFiles({ data: { repo: repo!, branch: branch! } }),
    enabled: open && !!repo && !!branch,
  });

  const defaultBranch = useMemo(
    () => repos.data?.find((r) => r.fullName === repo)?.defaultBranch,
    [repos.data, repo],
  );

  useEffect(() => {
    if (repo && !branch && defaultBranch) setBranch(defaultBranch);
  }, [repo, branch, defaultBranch]);

  const error = repos.error ?? branches.error ?? files.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Open an SVG from GitHub</DialogTitle>
          <DialogDescription>
            {!repo
              ? "Pick a repository."
              : !branch
                ? `Pick a branch in ${repo}.`
                : `SVG files in ${repo} · ${branch}`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-xs text-destructive">
            {error instanceof Error ? error.message : "Something went wrong."}
          </p>
        )}

        <Command shouldFilter className="rounded-md border border-border">
          <CommandInput
            placeholder={!repo ? "Search repositories…" : !branch ? "Search branches…" : "Search .svg files…"}
          />
          <CommandList className="max-h-[320px]">
            {(repos.isLoading || branches.isLoading || files.isLoading || opening) && (
              <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            )}
            <CommandEmpty>Nothing found.</CommandEmpty>

            {!repo && (
              <CommandGroup heading="Repositories">
                {repos.data?.map((r) => (
                  <CommandItem key={r.fullName} value={r.fullName} onSelect={() => setRepo(r.fullName)}>
                    <span className="truncate">{r.fullName}</span>
                    {r.private && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                        private
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {repo && !branch && (
              <CommandGroup heading="Branches">
                {branches.data?.map((b) => (
                  <CommandItem key={b} value={b} onSelect={() => setBranch(b)}>
                    {b}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {repo && branch && (
              <CommandGroup heading="SVG files">
                {files.data?.length === 0 && !files.isLoading && (
                  <div className="p-4 text-xs text-muted-foreground">
                    No .svg files on this branch.
                  </div>
                )}
                {files.data?.map((f) => (
                  <CommandItem
                    key={f.path}
                    value={f.path}
                    onSelect={async () => {
                      setOpening(true);
                      await onPick(repo, branch, f.path);
                      setOpening(false);
                    }}
                  >
                    <span className="truncate font-mono text-xs">{f.path}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>

        {(repo || branch) && (
          <DialogFooter className="sm:justify-start">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (branch ? setBranch(null) : setRepo(null))}
            >
              Back
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CommitDialog({
  open,
  onOpenChange,
  fileName,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fileName: string;
  onCommit: (message: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setMessage(`Update ${fileName} via Diagram Editor`);
  }, [open, fileName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
          <DialogDescription>Commits {fileName} to the branch you opened it from.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="commit-message">Commit message</Label>
          <Input
            id="commit-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            className="gap-2"
            disabled={busy || !message.trim()}
            onClick={async () => {
              setBusy(true);
              await onCommit(message.trim());
              setBusy(false);
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
