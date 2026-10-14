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
  usage = $state.raw<UsageProvider[]>([]);
  private usageAt = 0;
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
    this.loadUsage(true);
    setInterval(() => this.loadUsage(), 3 * 60_000);
  }

  /** Uso dos planos via `omp usage --json`. No máximo uma consulta por minuto, salvo `force`. */
  async loadUsage(force = false) {
    if (!force && Date.now() - this.usageAt < 60_000) return;
    this.usageAt = Date.now();
    try {
      this.usage = parseUsage(await api.usage());
    } catch {}
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
        this.loadUsage();
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
    if (c.cwd !== cwd) c.stop();
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

export interface UsageLimit {
  label: string;
  used: number; // 0..1
  resetsAt?: number;
}

export interface UsageProvider {
  id: string;
  name: string;
  plan?: string;
  limits: UsageLimit[];
  peak: number; // janela mais consumida, 0..1
}

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Claude",
  "openai-codex": "Codex",
  openai: "OpenAI",
  "xai-oauth": "Grok",
  xai: "Grok",
  "google-gemini-cli": "Gemini",
  google: "Gemini",
  "github-copilot": "Copilot",
};

export function parseUsage(raw: any): UsageProvider[] {
  const byId = new Map<string, UsageProvider>();
  for (const r of raw?.reports ?? []) {
    const id = String(r.provider ?? "");
    const p: UsageProvider = byId.get(id) ?? { id, name: PROVIDER_NAMES[id] ?? id, plan: r.metadata?.planType, limits: [], peak: 0 };
    for (const l of r.limits ?? []) {
      const used = Number(l.amount?.usedFraction ?? (l.amount?.limit ? l.amount.used / l.amount.limit : 0));
      if (!Number.isFinite(used)) continue;
      // O provedor repete o nome no rótulo ("Claude 5 Hour"); fica só a janela.
      const label = String(l.label ?? l.window?.label ?? "").replace(new RegExp(`^${p.name}\\s+`, "i"), "");
      p.limits.push({ label, used, resetsAt: l.window?.resetsAt });
      p.peak = Math.max(p.peak, used);
    }
    byId.set(id, p);
  }
  return [...byId.values()].filter((p) => p.limits.length);
}

export function basename(p: string) {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

export function tildify(p: string, home?: string) {
  return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

export const store = new Store();
