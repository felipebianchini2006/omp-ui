// Estado global: sessões em disco, conversas abertas e navegação.
import { api, onAgentExit, onAgentLine, onAgentStderr, type AppInfo, type SessionInfo } from "./bridge";
import { Conversation } from "./conversation.svelte";

const LAST_CWD = "omp-ui:last-cwd";
const OPEN = "omp-ui:open-projects";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export interface Project {
  cwd: string;
  name: string;
  sessions: SessionInfo[];
}

class Store {
  info = $state<AppInfo | null>(null);
  sessions = $state.raw<SessionInfo[]>([]);
  conversations = $state.raw<Conversation[]>([]);
  active = $state<Conversation | null>(null);
  sidebarOpen = $state(true);
  search = $state("");
  openProjects = $state<Record<string, boolean>>(load(OPEN, {}));
  private back: Conversation[] = [];
  private fwd: Conversation[] = [];
  canBack = $state(false);
  canFwd = $state(false);

  projects = $derived.by(() => {
    const q = this.search.trim().toLowerCase();
    const map = new Map<string, Project>();
    for (const s of this.sessions) {
      const name = basename(s.cwd);
      if (q && !s.title.toLowerCase().includes(q) && !name.toLowerCase().includes(q)) continue;
      let p = map.get(s.cwd);
      if (!p) map.set(s.cwd, (p = { cwd: s.cwd, name, sessions: [] }));
      p.sessions.push(s);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  });

  recentCwds = $derived.by(() => {
    const seen: string[] = [];
    for (const s of this.sessions) if (!seen.includes(s.cwd)) seen.push(s.cwd);
    return seen.slice(0, 8);
  });

  async init() {
    await onAgentLine((key, line) => this.byKey(key)?.handleLine(line));
    await onAgentStderr((key, line) => {
      const c = this.byKey(key);
      if (c) c.stderr = [...c.stderr.slice(-50), line];
    });
    await onAgentExit((key, code) => this.byKey(key)?.handleExit(code));
    this.info = await api.appInfo();
    await this.refresh();
    this.newDraft();
  }

  private byKey(key: string) {
    return this.conversations.find((c) => c.key === key);
  }

  async refresh() {
    this.sessions = await api.listSessions();
    // Atualiza títulos/caminhos de conversas que acabaram de ganhar arquivo em disco.
    for (const c of this.conversations) {
      const s = c.sessionId ? this.sessions.find((x) => x.id === c.sessionId) : null;
      if (s) {
        if (!c.path) c.path = s.path;
        if (s.title) c.title = s.title;
      }
    }
  }

  private track(c: Conversation) {
    if (!this.conversations.includes(c)) {
      c.onSettled = () => {
        if (this.active !== c) c.unread = true;
        this.refresh();
      };
      this.conversations = [...this.conversations, c];
    }
  }

  private go(c: Conversation, record = true) {
    if (this.active === c) return;
    if (record && this.active) {
      this.back.push(this.active);
      this.fwd = [];
    }
    this.active = c;
    c.unread = false;
    this.canBack = this.back.length > 0;
    this.canFwd = this.fwd.length > 0;
    c.load();
  }

  goBack() {
    const c = this.back.pop();
    if (!c) return;
    if (this.active) this.fwd.push(this.active);
    this.go(c, false);
  }

  goForward() {
    const c = this.fwd.pop();
    if (!c) return;
    if (this.active) this.back.push(this.active);
    this.go(c, false);
  }

  openSession(s: SessionInfo) {
    let c = this.conversations.find((x) => x.sessionId === s.id);
    if (!c) {
      c = new Conversation(s.cwd, s.path, s.id, s.title);
      this.track(c);
    }
    this.go(c);
  }

  newDraft(cwd?: string) {
    const dir = cwd ?? load<string | null>(LAST_CWD, null) ?? this.recentCwds[0] ?? this.info?.home ?? "/";
    const existing = this.conversations.find((c) => c.isDraft && c.cwd === dir);
    const c = existing ?? new Conversation(dir);
    this.track(c);
    this.go(c);
  }

  setDraftCwd(c: Conversation, cwd: string) {
    c.cwd = cwd;
    save(LAST_CWD, cwd);
  }

  async send(c: Conversation, text: string, images: Parameters<Conversation["send"]>[1]) {
    save(LAST_CWD, c.cwd);
    await c.send(text, images);
  }

  /** Por padrão só o projeto da sessão mais recente (ou da ativa) fica aberto. */
  isOpen(cwd: string) {
    const v = this.openProjects[cwd];
    if (v !== undefined) return v;
    return cwd === this.recentCwds[0] || cwd === this.active?.cwd;
  }

  toggleProject(cwd: string) {
    this.openProjects = { ...this.openProjects, [cwd]: !this.isOpen(cwd) };
    save(OPEN, this.openProjects);
  }

  isBusy(s: SessionInfo) {
    return this.conversations.find((c) => c.sessionId === s.id)?.busy ?? false;
  }

  isUnread(s: SessionInfo) {
    return this.conversations.find((c) => c.sessionId === s.id)?.unread ?? false;
  }
}

export function basename(p: string) {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

export function tildify(p: string, home?: string) {
  return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

export const store = new Store();
