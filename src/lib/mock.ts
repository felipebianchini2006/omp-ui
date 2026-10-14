// Dados falsos para abrir a interface no navegador, fora do Tauri.
import type { AppInfo, SessionInfo } from "./bridge";

const now = Date.now();
const H = 3600_000;
const projects = ["_infra", "api-pagamentos", "site-institucional", "app-mobile", "dashboard", "omp-ui"];
const titles = [
  "Revisar escopo do projeto",
  "Corrigir erro no login",
  "Refatorar módulo de pagamentos",
  "Ajustar build no Windows",
  "Criar testes de integração",
];

const sessions: SessionInfo[] = projects.flatMap((p, pi) =>
  titles.slice(0, (pi % 4) + 1).map((t, i) => ({
    id: `${p}-${i}`,
    title: t,
    cwd: `/Users/demo/Developer/${p}`,
    path: `/mock/${p}/${i}.jsonl`,
    updated: now - (pi * 5 + i) * H,
  })),
);

export const appInfo = async (): Promise<AppInfo> => ({
  user: "Demo",
  home: "/Users/demo",
  ompPath: "/opt/homebrew/bin/omp",
  ompVersion: "omp/18.10.4",
  defaultModel: "anthropic/claude-opus-5-5:auto",
});

export const listSessions = async () => sessions;

export const readSession = async (_path: string) => [
  { role: "user", content: [{ type: "text", text: "Corrija o título das sessões e rode os testes." }] },
  {
    role: "assistant",
    model: "claude-opus-5-5",
    content: [
      { type: "toolCall", id: "t0", name: "todo", arguments: { op: "init", items: [] } },
    ],
  },
  {
    role: "toolResult",
    toolCallId: "t0",
    content: [{ type: "text", text: "ok" }],
    details: { phases: [{ name: "Tasks", tasks: [
      { content: "Localizar onde o título é lido", status: "completed" },
      { content: "Remover ícones Nerd Font do título", status: "in_progress" },
      { content: "Rodar cargo test", status: "pending" },
    ] }] },
  },
  {
    role: "assistant",
    model: "claude-opus-5-5",
    content: [
      { type: "text", text: "Vou localizar onde o título é montado." },
      { type: "toolCall", id: "t1", name: "grep", arguments: { pattern: "title", path: "src-tauri/src", i: "Procurando leitura do título" } },
      { type: "toolCall", id: "t2", name: "read", arguments: { path: "src-tauri/src/sessions.rs", i: "Lendo sessions.rs" } },
      { type: "toolCall", id: "t3", name: "edit", arguments: { input: "[src-tauri/src/sessions.rs#A1B2]\n...", i: "Filtrando glifos" } },
    ],
  },
  { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "..." }], details: { matchCount: 7, fileCount: 2, fileMatches: [{ path: "src-tauri/src/sessions.rs", count: 6 }, { path: "src-tauri/src/lib.rs", count: 1 }] } },
  { role: "toolResult", toolCallId: "t2", content: [{ type: "text", text: "1:use serde::Serialize;" }], details: { totalLines: 172 } },
  {
    role: "toolResult",
    toolCallId: "t3",
    content: [{ type: "text", text: "ok" }],
    details: { diff: " 71|    let title = title\n-72|        .filter(|t| !t.trim().is_empty())\n+72|        .map(|t| strip_private_glyphs(&t))\n+73|        .filter(|t| !t.is_empty())\n 74|        .unwrap_or_else(|| first_prompt.chars().take(80).collect());" },
  },
  {
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "toolCall", id: "t4", name: "bash", arguments: { command: "cargo test", i: "Rodando testes" } }],
  },
  { role: "toolResult", toolCallId: "t4", content: [{ type: "text", text: "running 3 tests\ntest sessions::tests::segue_ramo_ativo ... ok\ntest tests::omp_rpc_responde ... ok\n\ntest result: ok. 3 passed; 0 failed" }], details: { wallTimeMs: 2380 } },
  {
    role: "assistant",
    model: "claude-opus-5-5",
    content: [
      {
        type: "text",
        text: "Pronto. Os **3 testes** passaram.\n\n- `sessions.rs` agora remove os glifos\n- o build está limpo\n\n```rust\nfn strip_private_glyphs(s: &str) -> String {\n    s.chars().filter(|c| !matches!(*c as u32, 0xE000..=0xF8FF)).collect()\n}\n```",
      },
    ],
  },
];

type Fn = (key: string, line: string) => void;
let emit: Fn = () => {};
export const onLine = async (fn: Fn) => {
  emit = fn;
};

const out = (key: string, ev: object) => setTimeout(() => emit(key, JSON.stringify(ev)), 0);

let lastKey = "";
export const startAgent = async (key: string) => {
  lastKey = key;
  out(key, { type: "ready" });
  out(key, {
    type: "available_commands_update",
    commands: [
      { name: "model", description: "Show current model selection" },
      { name: "fast", description: "Toggle fast mode", input: { hint: "[on|ultra|off|status]" }, subcommands: [{ name: "on", description: "Enable fast mode" }, { name: "off", description: "Disable fast mode" }, { name: "status", description: "Show fast mode status" }] },
      { name: "compact", description: "Compact the conversation" },
      { name: "usage", description: "Show usage limits" },
    ],
  });
};

// Reproduz linhas reais capturadas de `omp --mode rpc` na conversa ativa (teste manual).
(globalThis as any).__ompReplay = async (lines: string[], delay = 15) => {
  for (const l of lines) {
    emit(lastKey, l);
    await new Promise((r) => setTimeout(r, delay));
  }
};

export const sendAgent = async (key: string, line: string) => {
  const cmd = JSON.parse(line);
  if (cmd.type === "get_state") {
    out(key, {
      type: "response",
      id: cmd.id,
      success: true,
      data: {
        sessionId: "mock-new",
        thinkingLevel: "auto",
        model: { id: "claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic", thinking: { efforts: ["low", "medium", "high", "xhigh", "max"] } },
        contextUsage: { percent: 12 },
      },
    });
    return;
  }
  if (cmd.type === "prompt" && cmd.message.startsWith("/")) {
    out(key, { type: "command_output", text: `Saída simulada de ${cmd.message}.\nFast mode is off.` });
    out(key, { type: "response", id: cmd.id, success: true, data: { agentInvoked: false } });
    return;
  }
  out(key, { type: "response", id: cmd.id, success: true });
  if (cmd.type !== "prompt") return;
  out(key, { type: "agent_start" });
  out(key, { type: "message_start", messageId: "u1", message: { role: "user", content: [{ type: "text", text: cmd.message }] } });
  const full = "Entendi. Esta é uma resposta simulada do **modo mock**, só para revisar a interface.";
  let i = 0;
  const tick = setInterval(() => {
    i += 6;
    const partial = { role: "assistant", content: [{ type: "text", text: full.slice(0, i) }] };
    emit(key, JSON.stringify({ type: "message_update", messageId: "a1", assistantMessageEvent: { type: "text_delta", partial } }));
    if (i >= full.length) {
      clearInterval(tick);
      emit(key, JSON.stringify({ type: "session_settled" }));
    }
  }, 40);
};

// No navegador (vite) as fontes vêm direto do Claude.app via /@fs.
export const claudeFont = async (kind: string): Promise<ArrayBuffer> => {
  const base = "/@fs/Applications/Claude.app/Contents/Resources";
  const url =
    kind === "mono"
      ? `${base}/ion-dist/assets/v1/c5dbe0935-CQcSkHaI.woff2`
      : `${base}/fonts/AnthropicSans-${kind === "sans" ? "Romans" : "Italics"}-Variable-25x258.ttf`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(url);
  return r.arrayBuffer();
};

const lim = (id: string, label: string, used: number, inMs: number) => ({
  id,
  label,
  window: { resetsAt: Date.now() + inMs },
  amount: { usedFraction: used },
  status: used >= 1 ? "exhausted" : "ok",
});
export const usage = async () => ({
  reports: [
    { provider: "anthropic", limits: [lim("a:5h", "Claude 5 Hour", 0.14, 2.7 * H), lim("a:7d", "Claude 7 Day", 0.79, 67 * H), lim("a:7d:f", "Claude 7 Day (Fable)", 0.16, 67 * H)], metadata: {} },
    { provider: "openai-codex", limits: [lim("o:7d", "7 days", 0.2, 147 * H)], metadata: { planType: "pro" } },
    { provider: "xai-oauth", limits: [lim("x:1w", "SuperGrok Weekly Credits", 0, 33 * H)], metadata: {} },
  ],
});
