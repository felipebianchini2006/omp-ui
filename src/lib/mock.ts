// Dados falsos para abrir a interface no navegador, fora do Tauri.
import type { AppInfo, SessionInfo } from "./bridge";

const now = Date.now();
const H = 3600_000;
const projects = ["_infra", "app-mulheres", "bianchini-method", "conectarmarcearia", "kromahub", "omp-ui"];
const titles = [
  "Análise método Bianchini e escopo",
  "Fluxo de pequenas mudanças no SDD",
  "Subfases no roadmap",
  "Análise de erro no Windows",
  "BGL comando /executar fase",
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
  user: "Felipe Bianchini",
  home: "/Users/demo",
  ompPath: "/opt/homebrew/bin/omp",
  ompVersion: "omp/18.10.4",
  defaultModel: "anthropic/claude-opus-5-5:auto",
});

export const listSessions = async () => sessions;

export const readSession = async (_path: string) => [
  { role: "user", content: [{ type: "text", text: "Leia o README e rode os testes." }] },
  {
    role: "assistant",
    model: "claude-opus-5-5",
    content: [
      { type: "thinking", thinking: "Vou ler o README primeiro." },
      { type: "text", text: "Vou ler o README e rodar a suíte." },
      { type: "toolCall", id: "t1", name: "read", arguments: { path: "README.md" }, intent: "Lendo README" },
      { type: "toolCall", id: "t2", name: "bash", arguments: { command: "cargo test" }, intent: "Rodando testes" },
    ],
  },
  { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "# Projeto\n\nDescrição." }] },
  { role: "toolResult", toolCallId: "t2", content: [{ type: "text", text: "test result: ok. 12 passed" }] },
  {
    role: "assistant",
    model: "claude-opus-5-5",
    content: [
      {
        type: "text",
        text: "Pronto. Os **12 testes** passaram.\n\n- `sessions.rs` cobre o ramo ativo\n- o build está limpo\n\n```rust\nfn main() {\n    println!(\"ok\");\n}\n```",
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
