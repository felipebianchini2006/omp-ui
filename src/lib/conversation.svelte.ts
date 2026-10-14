// Uma conversa com o OMP: mensagens, estado do processo `omp --mode rpc` e o protocolo.
import { api } from "./bridge";

export type Msg = { role: string; content?: any; [k: string]: any };

export interface ToolRun {
  status: "running" | "done" | "error";
  output?: string;
}

export interface UiRequest {
  id: string;
  method: string;
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
}

export interface SlashCommand {
  name: string;
  description?: string;
  hint?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  efforts: string[];
}

export interface Attachment {
  name: string;
  mimeType: string;
  data: string; // base64
}

let seq = 0;
const newKey = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

export class Conversation {
  key: string;
  cwd = $state("");
  path = $state<string | null>(null);
  sessionId = $state<string | null>(null);
  title = $state("");

  messages = $state.raw<{ id: string; msg: Msg }[]>([]);
  results = $state.raw<Record<string, Msg>>({});
  runs = $state.raw<Record<string, ToolRun>>({});

  loaded = $state(false);
  running = $state(false); // processo omp vivo
  busy = $state(false); // agente trabalhando
  pendingPrompt = $state<string | null>(null);
  error = $state<string | null>(null);
  stderr: string[] = [];

  model = $state<ModelInfo | null>(null);
  thinkingLevel = $state<string>("");
  contextPercent = $state<number | null>(null);
  statuses = $state<Record<string, string>>({});
  uiRequests = $state<UiRequest[]>([]);
  commands = $state<SlashCommand[]>([]);
  unread = $state(false);

  private reqSeq = 0;
  private pending = new Map<string, (r: any) => void>();
  private ready: Promise<void> | null = null;
  private markReady: (() => void) | null = null;
  onSettled: (() => void) | null = null;

  constructor(cwd: string, path: string | null = null, sessionId: string | null = null, title = "") {
    this.key = newKey();
    this.cwd = cwd;
    this.path = path;
    this.sessionId = sessionId;
    this.title = title;
    if (!path) this.loaded = true;
  }

  get isDraft() {
    return !this.path && !this.sessionId && this.messages.length === 0 && !this.pendingPrompt;
  }

  async load() {
    if (this.loaded || !this.path) return;
    try {
      const msgs = await api.readSession(this.path);
      const list: { id: string; msg: Msg }[] = [];
      const results: Record<string, Msg> = {};
      msgs.forEach((m, i) => {
        if (m.role === "toolResult") results[m.toolCallId] = m;
        else list.push({ id: `h${i}`, msg: m });
      });
      this.messages = list;
      this.results = results;
      const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant" && m.model);
      if (lastAssistant && !this.model) {
        this.model = { id: lastAssistant.model, name: prettyModel(lastAssistant.model), provider: lastAssistant.provider ?? "", efforts: [] };
      }
    } catch (e) {
      this.error = String(e);
    }
    this.loaded = true;
  }

  /** Inicia o processo omp (lazy: só quando o usuário manda algo). */
  async ensureRunning() {
    if (this.running && this.ready) return this.ready;
    this.ready = new Promise((res) => (this.markReady = res));
    this.running = true;
    this.error = null;
    try {
      await api.startAgent(this.key, this.cwd, this.path ?? undefined);
    } catch (e) {
      this.running = false;
      this.ready = null;
      this.error = String(e);
      throw e;
    }
    return this.ready;
  }

  private write(cmd: Record<string, any>) {
    return api.sendAgent(this.key, JSON.stringify(cmd));
  }

  request(type: string, payload: Record<string, any> = {}): Promise<any> {
    const id = `r${++this.reqSeq}`;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.write({ id, type, ...payload }).catch((e) => {
        this.pending.delete(id);
        resolve({ success: false, error: String(e) });
      });
    });
  }

  async send(text: string, images: Attachment[] = []) {
    const message = text.trim();
    if (!message && images.length === 0) return;
    const imgs = images.map((i) => ({ type: "image", data: i.data, mimeType: i.mimeType }));
    if (this.busy) {
      await this.request("steer", { message, ...(imgs.length ? { images: imgs } : {}) });
      return;
    }
    this.pendingPrompt = message;
    this.busy = true;
    try {
      await this.ensureRunning();
    } catch {
      this.busy = false;
      this.pendingPrompt = null;
      return;
    }
    const r = await this.request("prompt", { message, ...(imgs.length ? { images: imgs } : {}) });
    if (r && r.success === false) {
      this.error = r.error ?? "Falha ao enviar o prompt";
      this.busy = false;
      this.pendingPrompt = null;
    }
  }

  abort() {
    if (this.running) this.write({ type: "abort" });
  }

  async setThinking(level: string) {
    this.thinkingLevel = level;
    await this.ensureRunning();
    await this.request("set_thinking_level", { level });
  }

  async refreshState() {
    const r = await this.request("get_state");
    if (!r?.success) return;
    const d = r.data;
    if (d.sessionId) this.sessionId = d.sessionId;
    if (d.thinkingLevel) this.thinkingLevel = d.thinkingLevel;
    if (d.model) {
      this.model = {
        id: d.model.id,
        name: d.model.name ?? prettyModel(d.model.id),
        provider: d.model.provider,
        efforts: d.model.thinking?.efforts ?? [],
      };
    }
    if (d.contextUsage?.percent != null) this.contextPercent = d.contextUsage.percent;
  }

  answerUi(id: string, response: Record<string, any>) {
    this.uiRequests = this.uiRequests.filter((r) => r.id !== id);
    this.write({ type: "extension_ui_response", id, ...response });
  }

  handleExit(code: number | null) {
    this.running = false;
    this.ready = null;
    this.busy = false;
    this.pendingPrompt = null;
    for (const resolve of this.pending.values()) resolve({ success: false, error: "omp encerrou" });
    this.pending.clear();
    if (code && code !== 0) {
      const tail = this.stderr.slice(-6).join("\n");
      this.error = `O omp encerrou com código ${code}.${tail ? "\n" + tail : ""}`;
    }
  }

  handleLine(line: string) {
    let ev: any;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    switch (ev.type) {
      case "ready":
        this.markReady?.();
        this.markReady = null;
        this.refreshState();
        break;
      case "response": {
        const resolve = ev.id && this.pending.get(ev.id);
        if (resolve) {
          this.pending.delete(ev.id);
          resolve(ev);
        }
        break;
      }
      case "agent_start":
        this.busy = true;
        break;
      case "message_start":
      case "message_end":
        this.upsert(ev.messageId, ev.message);
        break;
      case "message_update":
        if (ev.assistantMessageEvent?.partial) this.upsert(ev.messageId, ev.assistantMessageEvent.partial);
        break;
      case "tool_execution_start":
        this.runs = { ...this.runs, [ev.toolCallId]: { status: "running" } };
        break;
      case "tool_execution_update":
        this.runs = { ...this.runs, [ev.toolCallId]: { status: "running", output: textOf(ev.partialResult?.content) } };
        break;
      case "tool_execution_end":
        this.runs = {
          ...this.runs,
          [ev.toolCallId]: { status: ev.isError ? "error" : "done", output: textOf(ev.result?.content) },
        };
        break;
      case "thinking_level_changed":
        this.thinkingLevel = ev.configured ?? ev.thinkingLevel;
        break;
      case "available_commands_update":
        this.commands = (ev.commands ?? []).map((c: any) => ({
          name: c.name,
          description: c.description,
          hint: c.input?.hint,
        }));
        break;
      case "prompt_result":
        if (ev.status === "error" && ev.error?.message) this.error = ev.error.message;
        break;
      case "agent_end":
      case "session_settled":
        this.busy = false;
        this.pendingPrompt = null;
        if (ev.type === "session_settled") {
          this.refreshState();
          this.onSettled?.();
        }
        break;
      case "extension_ui_request":
        this.handleUi(ev);
        break;
    }
  }

  private upsert(id: string | undefined, msg: Msg) {
    if (!msg) return;
    if (msg.role === "toolResult") {
      this.results = { ...this.results, [msg.toolCallId]: msg };
      return;
    }
    if (msg.role === "user") this.pendingPrompt = null;
    const key = id ?? `m${this.messages.length}`;
    const i = this.messages.findIndex((m) => m.id === key);
    const next = this.messages.slice();
    if (i >= 0) next[i] = { id: key, msg };
    else next.push({ id: key, msg });
    this.messages = next;
  }

  private handleUi(ev: any) {
    switch (ev.method) {
      case "setStatus":
        if (ev.statusText) this.statuses[ev.statusKey] = ev.statusText;
        else delete this.statuses[ev.statusKey];
        break;
      case "setTitle":
        if (ev.title) this.title = ev.title;
        break;
      case "select":
      case "confirm":
      case "input":
      case "editor":
        this.uiRequests.push({
          id: ev.id,
          method: ev.method,
          title: ev.title,
          message: ev.message,
          options: ev.options,
          placeholder: ev.placeholder,
          prefill: ev.prefill,
        });
        break;
    }
  }
}

export function textOf(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c?.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/** "claude-opus-5-5" -> "Opus 5.5"; "gpt-6.1-sol" -> "GPT 6.1 Sol". */
export function prettyModel(id: string): string {
  if (!id) return "";
  const bare = id.split("/").pop()!.split(":")[0];
  const claude = bare.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/);
  if (claude) {
    const fam = claude[1][0].toUpperCase() + claude[1].slice(1);
    return `${fam} ${claude[2]}${claude[3] ? "." + claude[3] : ""}`;
  }
  return bare
    .split("-")
    .map((p) => (p === "gpt" ? "GPT" : p[0].toUpperCase() + p.slice(1)))
    .join(" ");
}
