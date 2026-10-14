<script lang="ts">
  // Uma chamada de ferramenta: linha-resumo e, ao abrir, o conteúdo formatado por tipo.
  import Icon from "./Icon.svelte";
  import { textOf, type Msg, type ToolRun } from "../lib/conversation.svelte";

  let { call, result, run, live }: { call: any; result?: Msg; run?: ToolRun; live: boolean } = $props();

  const name: string = $derived(call.name);
  const args = $derived(call.arguments ?? {});
  const details = $derived((result?.details ?? {}) as any);
  const status = $derived(run?.status ?? (result ? (result.isError ? "error" : "done") : live ? "running" : "done"));
  const output = $derived(result ? textOf(result.content) : (run?.output ?? ""));
  const intent: string = $derived(call.intent ?? args.i ?? "");

  // Lista de tarefas e perguntas ficam abertas por padrão: são o "plano" visível do agente.
  let open = $state(false);
  let full = $state(false);
  $effect.pre(() => {
    if (name === "todo" || name === "ask") open = true;
  });

  const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
  const firstLine = (s: unknown) => (typeof s === "string" ? s.split("\n")[0] : "");

  type DiffLine = { sign: " " | "+" | "-"; num: string; text: string };

  function parseDiff(d: unknown): DiffLine[] {
    if (typeof d !== "string") return [];
    return d.split("\n").flatMap((l) => {
      const m = l.match(/^([ +\-])\s*(\d*)\|(.*)$/);
      return m ? [{ sign: m[1] as DiffLine["sign"], num: m[2], text: m[3] }] : [];
    });
  }

  const editPath = $derived.by(() => {
    if (typeof args.path === "string") return args.path;
    const m = typeof args.input === "string" ? args.input.match(/^\[([^\]#]+)/) : null;
    return m?.[1] ?? "";
  });

  const diff = $derived(name === "edit" ? parseDiff(details.diff) : []);
  const xdev = $derived(details.xdev?.inner ? details.xdev : null);

  const view = $derived.by((): { icon: string; verb: string; target: string; meta: string } => {
    switch (name) {
      case "bash": {
        const secs = details.wallTimeMs ? `${(details.wallTimeMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s` : "";
        return { icon: "terminal", verb: "Executou", target: firstLine(args.command), meta: secs };
      }
      case "read":
        return {
          icon: "file",
          verb: "Leu",
          target: String(args.path ?? ""),
          meta: details.totalLines ? plural(details.totalLines, "linha", "linhas") : "",
        };
      case "edit": {
        const add = diff.filter((d) => d.sign === "+").length;
        const del = diff.filter((d) => d.sign === "-").length;
        return { icon: "edit", verb: "Editou", target: editPath, meta: diff.length ? `+${add} −${del}` : "" };
      }
      case "write":
        if (xdev || String(args.path ?? "").startsWith("xd://")) {
          const inner = xdev?.inner;
          const tool = inner ? `${inner.serverName} · ${inner.mcpToolName}` : String(args.path).replace("xd://", "");
          return { icon: "spark", verb: "MCP", target: tool, meta: "" };
        }
        return {
          icon: "edit",
          verb: "Escreveu",
          target: String(args.path ?? ""),
          meta: typeof args.content === "string" ? plural(args.content.split("\n").length, "linha", "linhas") : "",
        };
      case "grep":
        return {
          icon: "search",
          verb: "Buscou",
          target: String(args.pattern ?? ""),
          meta: details.matchCount != null ? `${plural(details.matchCount, "resultado", "resultados")} em ${plural(details.fileCount ?? 0, "arquivo", "arquivos")}` : "",
        };
      case "glob":
      case "find":
        return {
          icon: "folder",
          verb: "Listou",
          target: String(args.path ?? args.pattern ?? ""),
          meta: details.fileCount != null ? plural(details.fileCount, "arquivo", "arquivos") : "",
        };
      case "web_search":
        return {
          icon: "globe",
          verb: "Pesquisou",
          target: String(args.query ?? ""),
          meta: details.response?.sources ? plural(details.response.sources.length, "fonte", "fontes") : "",
        };
      case "todo":
        return { icon: "list", verb: "Tarefas", target: "", meta: todoMeta };
      case "task":
        return { icon: "agent", verb: "Subagente", target: intent, meta: agents.length ? plural(agents.length, "agente", "agentes") : "" };
      case "eval":
        return { icon: "spark", verb: "Rodou código", target: String(args.title ?? ""), meta: details.language ?? args.language ?? "" };
      case "ask":
        return { icon: "agent", verb: "Perguntou", target: "", meta: "" };
      case "wait":
        return { icon: "spark", verb: "Aguardou", target: intent, meta: "" };
      default: {
        const first = Object.entries(args).find(([k, x]) => k !== "i" && typeof x === "string");
        return { icon: "spark", verb: name, target: first ? firstLine(first[1]) : "", meta: "" };
      }
    }
  });

  type Task = { content: string; status: string };
  const tasks = $derived.by((): Task[] => {
    const phases = details.phases;
    if (Array.isArray(phases)) return phases.flatMap((p: any) => p.tasks ?? []);
    return Array.isArray(args.items) ? args.items.map((c: string) => ({ content: c, status: "pending" })) : [];
  });
  const todoMeta = $derived.by(() => {
    if (!tasks.length) return "";
    const done = tasks.filter((t) => t.status === "completed" || t.status === "done").length;
    return `${done}/${tasks.length}`;
  });
  const agents = $derived(Array.isArray(details.progress) ? details.progress : []);
  const sources = $derived(Array.isArray(details.response?.sources) ? details.response.sources : []);
  const files = $derived.by((): { path: string; count?: number }[] => {
    if (Array.isArray(details.fileMatches)) return details.fileMatches;
    if (Array.isArray(details.files)) return details.files.map((f: string) => ({ path: f }));
    return [];
  });

  const MAX_LINES = 24;
  function clip(s: string) {
    const lines = s.split("\n");
    if (full || lines.length <= MAX_LINES) return { text: s, more: 0 };
    return { text: lines.slice(0, MAX_LINES).join("\n"), more: lines.length - MAX_LINES };
  }

  const inputText = $derived.by(() => {
    if (name === "bash") return String(args.command ?? "");
    if (name === "eval") return String(args.code ?? "");
    if (xdev) return JSON.stringify(xdev.args ?? {}, null, 2);
    const { i, ...rest } = args;
    return Object.keys(rest).length ? JSON.stringify(rest, null, 2) : "";
  });
  const outText = $derived(clip(output));
</script>

<div class="tool" class:open>
  <button class="head" onclick={() => (open = !open)}>
    <span class="ico" class:err={status === "error"}>
      {#if status === "running"}<span class="spinner"></span>{:else}<Icon name={view.icon} size={14} />{/if}
    </span>
    <span class="verb">{view.verb}</span>
    {#if view.target}<code class="target">{view.target}</code>{/if}
    {#if view.meta}
      <span class="meta">
        {#if name === "edit" && diff.length}
          <span class="add">{view.meta.split(" ")[0]}</span> <span class="del">{view.meta.split(" ")[1]}</span>
        {:else}{view.meta}{/if}
      </span>
    {/if}
    {#if intent && intent !== view.target && name !== "task" && name !== "wait"}<span class="intent">{intent}</span>{/if}
    {#if status === "error"}<span class="badge">erro</span>{/if}
    <span class="chev"><Icon name="chevron" size={12} /></span>
  </button>

  {#if open}
    <div class="body selectable">
      {#if name === "edit" && diff.length}
        <div class="diff">
          {#each diff as d}
            <div class="dl {d.sign === '+' ? 'plus' : d.sign === '-' ? 'minus' : ''}">
              <span class="dn">{d.num}</span><span class="ds">{d.sign === " " ? "" : d.sign}</span><span class="dt">{d.text}</span>
            </div>
          {/each}
        </div>
      {:else if name === "todo" && tasks.length}
        <ul class="todo">
          {#each tasks as t}
            {@const st = t.status === "completed" || t.status === "done" ? "done" : t.status === "in_progress" ? "doing" : "todo"}
            <li class={st}>
              <span class="box">{#if st === "done"}<Icon name="check" size={11} stroke={2.4} />{/if}</span>
              <span>{t.content}</span>
            </li>
          {/each}
        </ul>
      {:else if name === "ask"}
        <div class="ask">
          <div class="q">{details.question ?? args.questions?.[0]?.question ?? ""}</div>
          {#if details.selectedOptions?.length}
            <div class="a"><Icon name="check" size={13} /> {details.selectedOptions.join(", ")}</div>
          {:else if status === "running"}
            <div class="pending">Aguardando resposta…</div>
          {/if}
        </div>
      {:else if name === "web_search" && sources.length}
        <ul class="list">
          {#each sources.slice(0, 10) as s}
            <li><span class="src-title">{s.title}</span> <span class="src-url">{s.url}</span></li>
          {/each}
        </ul>
      {:else if (name === "grep" || name === "glob" || name === "find") && files.length}
        <ul class="list mono">
          {#each files.slice(0, full ? files.length : 30) as f}
            <li>{f.path}{#if f.count}<span class="cnt"> {f.count}</span>{/if}</li>
          {/each}
          {#if !full && files.length > 30}
            <li><button class="more" onclick={() => (full = true)}>Mostrar mais {files.length - 30}</button></li>
          {/if}
        </ul>
      {:else if name === "task" && agents.length}
        <ul class="list">
          {#each agents as a}
            <li><span class="agent">{a.id ?? a.agent}</span> <span class="src-url">{a.agent} · {a.status}</span></li>
          {/each}
        </ul>
      {:else}
        <div class="io">
          {#if inputText && name !== "read"}
            <div class="io-row">
              <span class="io-k">IN</span>
              <pre>{name === "bash" ? "$ " : ""}{inputText}</pre>
            </div>
          {/if}
          {#if output}
            <div class="io-row">
              <span class="io-k">OUT</span>
              <pre class:err={status === "error"}>{outText.text}</pre>
            </div>
            {#if outText.more}
              <button class="more" onclick={() => (full = true)}>Mostrar mais {outText.more} linhas</button>
            {/if}
          {:else if status === "running"}
            <div class="io-row"><span class="io-k">OUT</span><span class="pending">Executando…</span></div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool {
    margin: 1px 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    min-height: 26px;
    padding: 2px 6px 2px 2px;
    border-radius: 6px;
    font-size: var(--fs-body);
    color: var(--text-3);
    text-align: left;
  }
  .ico {
    width: 18px;
    display: grid;
    place-items: center;
    flex: none;
    color: var(--text-3);
  }
  .ico.err {
    color: var(--danger);
  }
  .verb {
    flex: none;
    color: var(--text-2);
  }
  .target {
    font-family: var(--mono);
    font-size: var(--fs-code);
    color: var(--text-2);
    background: var(--alpha-1);
    border-radius: 5px;
    padding: 1px 6px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .meta {
    flex: none;
    font-size: var(--fs-footnote);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .add {
    color: var(--ok);
  }
  .del {
    color: var(--danger);
  }
  .intent {
    color: var(--text-4);
    font-size: var(--fs-footnote);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex-shrink: 3;
  }
  .badge {
    flex: none;
    font-size: var(--fs-caption);
    color: var(--danger);
    border: 1px solid rgba(240, 122, 110, 0.35);
    border-radius: 4px;
    padding: 0 5px;
  }
  .chev {
    opacity: 0;
    flex: none;
    color: var(--text-4);
    transition: transform 0.12s;
  }
  .head:hover .chev,
  .open .chev {
    opacity: 1;
  }
  .open .chev {
    transform: rotate(90deg);
  }
  .head:hover .verb {
    color: var(--text);
  }
  .body {
    margin: 4px 0 8px 25px;
    border: 1px solid var(--border-soft);
    border-radius: 9px;
    background: var(--bg-raised);
    overflow: hidden;
  }
  /* Entrada e saída, no formato IN/OUT do Claude. */
  .io-row {
    display: grid;
    grid-template-columns: 36px 1fr;
    gap: 6px;
    padding: 7px 10px;
  }
  .io-row + .io-row {
    border-top: 1px solid var(--border-soft);
  }
  .io-k {
    font-family: var(--mono);
    font-size: var(--fs-caption);
    color: var(--text-4);
    padding-top: 1px;
  }
  pre {
    margin: 0;
    font-family: var(--mono);
    font-size: var(--fs-code);
    line-height: 1.5;
    color: var(--text-2);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 420px;
    overflow: auto;
  }
  pre.err {
    color: var(--danger);
  }
  .pending {
    font-size: var(--fs-footnote);
    color: var(--text-3);
  }
  .more {
    display: block;
    width: 100%;
    padding: 5px 10px 7px;
    text-align: left;
    font-size: var(--fs-footnote);
    color: var(--text-3);
    border-top: 1px solid var(--border-soft);
  }
  .more:hover {
    color: var(--text);
  }
  .diff {
    font-family: var(--mono);
    font-size: var(--fs-code);
    line-height: 1.55;
    max-height: 420px;
    overflow: auto;
    padding: 4px 0;
  }
  .dl {
    display: grid;
    grid-template-columns: 40px 16px 1fr;
    color: var(--text-3);
  }
  .dl.plus {
    background: rgba(111, 191, 115, 0.12);
    color: var(--text);
  }
  .dl.minus {
    background: rgba(240, 122, 110, 0.12);
    color: var(--text);
  }
  .dn {
    text-align: right;
    padding-right: 8px;
    color: var(--text-4);
    user-select: none;
  }
  .ds {
    color: var(--text-4);
  }
  .plus .ds {
    color: var(--ok);
  }
  .minus .ds {
    color: var(--danger);
  }
  .dt {
    white-space: pre-wrap;
    word-break: break-word;
    padding-right: 10px;
  }
  .todo {
    list-style: none;
    margin: 0;
    padding: 6px 10px;
  }
  .todo li {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 3px 0;
    font-size: var(--fs-body);
    color: var(--text-2);
  }
  .todo .box {
    flex: none;
    width: 15px;
    height: 15px;
    margin-top: 2px;
    border-radius: 4px;
    border: 1.4px solid var(--text-4);
    display: grid;
    place-items: center;
  }
  .todo .done {
    color: var(--text-3);
    text-decoration: line-through;
    text-decoration-color: var(--text-4);
  }
  .todo .done .box {
    background: var(--text-3);
    border-color: var(--text-3);
    color: var(--bg-main);
  }
  .todo .doing {
    color: var(--text);
  }
  .todo .doing .box {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 3px var(--bg-raised), inset 0 0 0 8px var(--accent);
  }
  .ask {
    padding: 8px 12px;
    font-size: var(--fs-body);
  }
  .q {
    color: var(--text-2);
    white-space: pre-wrap;
  }
  .a {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    color: var(--text);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 6px 10px;
    font-size: var(--fs-footnote);
    max-height: 320px;
    overflow: auto;
  }
  .list li {
    padding: 2px 0;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .list.mono {
    font-family: var(--mono);
    font-size: var(--fs-code);
  }
  .cnt,
  .src-url {
    color: var(--text-4);
  }
  .agent {
    color: var(--text);
  }
  .list .more {
    border: 0;
    padding: 4px 0;
  }
</style>
