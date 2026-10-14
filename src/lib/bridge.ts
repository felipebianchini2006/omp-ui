// Ponte com o backend Rust. Fora do Tauri (vite no navegador) usa um mock,
// útil só para revisar a interface.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import * as mock from "./mock";

export interface SessionInfo {
  id: string;
  title: string;
  cwd: string;
  path: string;
  updated: number;
}

export interface AppInfo {
  user: string;
  home: string;
  ompPath: string;
  ompVersion: string;
  defaultModel: string;
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api = {
  appInfo: (): Promise<AppInfo> => (inTauri ? invoke("app_info") : mock.appInfo()),
  listSessions: (): Promise<SessionInfo[]> => (inTauri ? invoke("list_sessions") : mock.listSessions()),
  readSession: (path: string): Promise<any[]> =>
    inTauri ? invoke("read_session", { path }) : mock.readSession(path),
  startAgent: (key: string, cwd: string, resume?: string): Promise<void> =>
    inTauri ? invoke("start_agent", { key, cwd, resume: resume ?? null }) : mock.startAgent(key),
  sendAgent: (key: string, line: string): Promise<void> =>
    inTauri ? invoke("send_agent", { key, line }) : mock.sendAgent(key, line),
  stopAgent: (key: string): Promise<void> => (inTauri ? invoke("stop_agent", { key }) : Promise.resolve()),
  usage: (): Promise<any> => (inTauri ? invoke("omp_usage") : mock.usage()),
  pickFolder: async (defaultPath?: string): Promise<string | null> => {
    if (!inTauri) return "/Users/demo/Developer/novo-projeto";
    const r = await open({ directory: true, multiple: false, defaultPath });
    return typeof r === "string" ? r : null;
  },
};

type LineHandler = (key: string, line: string) => void;
type ExitHandler = (key: string, code: number | null) => void;

export async function onAgentLine(fn: LineHandler) {
  if (!inTauri) return mock.onLine(fn);
  await listen<{ key: string; line: string }>("omp-line", (e) => fn(e.payload.key, e.payload.line));
}

export async function onAgentStderr(fn: LineHandler) {
  if (!inTauri) return;
  await listen<{ key: string; line: string }>("omp-stderr", (e) => fn(e.payload.key, e.payload.line));
}

export async function onAgentExit(fn: ExitHandler) {
  if (!inTauri) return;
  await listen<{ key: string; code: number | null }>("omp-exit", (e) => fn(e.payload.key, e.payload.code));
}

/** Usa a Anthropic Sans/Mono do Claude.app instalado, se existir. Senão fica a fonte do sistema. */
export async function loadClaudeFonts() {
  const faces: [string, string, string][] = [
    ["sans", "anthropic-sans", "normal"],
    ["sans-italic", "anthropic-sans", "italic"],
    ["mono", "anthropic-mono", "normal"],
  ];
  await Promise.all(
    faces.map(async ([kind, family, style]) => {
      try {
        const data: ArrayBuffer = inTauri ? await invoke("claude_font", { kind }) : await mock.claudeFont(kind);
        const face = new FontFace(family, data, { weight: "300 800", style });
        document.fonts.add(await face.load());
      } catch {}
    }),
  );
}
