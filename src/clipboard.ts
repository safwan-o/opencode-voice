import { spawn } from "node:child_process";

export type RunFn = (command: string, args: readonly string[], input: string) => Promise<void>;

const defaultRun: RunFn = (command, args, input) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.stdin.write(input);
    child.stdin.end();
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });

export interface ClipboardDeps {
  platform?: NodeJS.Platform;
  wayland?: boolean;
  run?: RunFn;
}

function candidates(
  platform: NodeJS.Platform,
  wayland: boolean,
): Array<{ command: string; args: string[]; hint: string }> {
  if (platform === "darwin")
    return [{ command: "pbcopy", args: [], hint: "pbcopy (ships with macOS)" }];
  if (platform === "win32")
    return [{ command: "clip", args: [], hint: "clip (ships with Windows)" }];
  const list: Array<{ command: string; args: string[]; hint: string }> = [];
  if (wayland) list.push({ command: "wl-copy", args: [], hint: "wl-clipboard package" });
  list.push(
    { command: "xclip", args: ["-selection", "clipboard"], hint: "xclip package" },
    { command: "xsel", args: ["--clipboard", "--input"], hint: "xsel package" },
  );
  return list;
}

/** Copy text to the OS clipboard. Throws with install hint when no tool works. */
export async function copyText(
  text: string,
  deps: ClipboardDeps = {},
): Promise<{ method: string }> {
  const platform = deps.platform ?? process.platform;
  const wayland = deps.wayland ?? Boolean(process.env.WAYLAND_DISPLAY);
  const run = deps.run ?? defaultRun;
  const tried: string[] = [];
  let hint = "";
  for (const c of candidates(platform, wayland)) {
    tried.push(c.command);
    hint = c.hint;
    try {
      await run(c.command, c.args, text);
      return { method: c.command };
    } catch {
      // try next candidate
    }
  }
  throw new Error(`No clipboard tool worked (tried ${tried.join(", ")}). Install ${hint}.`);
}
