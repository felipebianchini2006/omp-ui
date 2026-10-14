<script lang="ts">
  import Icon from "./Icon.svelte";
  import { textOf, type Msg, type ToolRun } from "../lib/conversation.svelte";

  let { call, result, run, live }: { call: any; result?: Msg; run?: ToolRun; live: boolean } = $props();

  let open = $state(false);

  const TOOLS: Record<string, { verb: string; icon: string; arg?: string }> = {
    read: { verb: "Leu", icon: "file", arg: "path" },
    write: { verb: "Escreveu", icon: "edit", arg: "path" },
    edit: { verb: "Editou", icon: "edit", arg: "path" },
    bash: { verb: "Executou", icon: "terminal", arg: "command" },
    grep: { verb: "Buscou", icon: "search", arg: "pattern" },
    glob: { verb: "Listou", icon: "search", arg: "pattern" },
    find: { verb: "Procurou", icon: "search", arg: "pattern" },
    web_search: { verb: "Pesquisou", icon: "globe", arg: "query" },
    fetch: { verb: "Buscou", icon: "globe", arg: "url" },
    task: { verb: "Subagente", icon: "agent" },
    todo: { verb: "Tarefas", icon: "list" },
    eval: { verb: "Avaliou", icon: "spark" },
  };

  const meta = $derived(TOOLS[call.name] ?? { verb: call.name, icon: "spark" });
  const args = $derived(call.arguments ?? {});
  const target = $derived.by(() => {
    const v = meta.arg ? args[meta.arg] : undefined;
    if (typeof v === "string") return v.split("\n")[0];
    const first = Object.entries(args).find(([k, x]) => k !== "i" && typeof x === "string");
    return first ? String(first[1]).split("\n")[0] : "";
  });
  const intent = $derived(call.intent ?? args.i ?? "");
  const status = $derived(
    run?.status ?? (result ? (result.isError ? "error" : "done") : live ? "running" : "done"),
  );
  const output = $derived(result ? textOf(result.content) : (run?.output ?? ""));
  const input = $derived.by(() => {
    if (call.name === "bash" && typeof args.command === "string") return args.command;
    const { i, ...rest } = args;
    return Object.keys(rest).length ? JSON.stringify(rest, null, 2) : "";
  });
  const clipped = (s: string, n = 12000) => (s.length > n ? s.slice(0, n) + `\n… (${s.length - n} caracteres omitidos)` : s);
</script>

<div class="tool" class:open>
  <button class="head" onclick={() => (open = !open)}>
    <span class="ico" class:err={status === "error"}>
      {#if status === "running"}
        <span class="spinner"></span>
      {:else}
        <Icon name={meta.icon} size={14} />
      {/if}
    </span>
    <span class="verb">{meta.verb}</span>
    {#if target}<span class="target">{target}</span>{/if}
    {#if intent && intent !== target}<span class="intent">{intent}</span>{/if}
    <span class="chev"><Icon name="chevron" size={12} /></span>
  </button>
  {#if open}
    <div class="body selectable">
      {#if input}
        <div class="label">Entrada</div>
        <pre>{clipped(input, 4000)}</pre>
      {/if}
      {#if output}
        <div class="label">{status === "error" ? "Erro" : "Saída"}</div>
        <pre class:err={status === "error"}>{clipped(output)}</pre>
      {:else if status === "running"}
        <div class="label">Executando…</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool {
    margin: 2px 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 4px 8px 4px 2px;
    border-radius: 7px;
    font-size: 14px;
    color: var(--text-3);
    text-align: left;
  }
  .head:hover {
    color: var(--text-2);
  }
  .ico {
    width: 18px;
    display: grid;
    place-items: center;
    flex: none;
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
    font-size: 12.5px;
    color: var(--text-3);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .intent {
    color: var(--text-4);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex-shrink: 2;
  }
  .chev {
    opacity: 0;
    flex: none;
    transition: transform 0.12s;
  }
  .head:hover .chev,
  .open .chev {
    opacity: 1;
  }
  .open .chev {
    transform: rotate(90deg);
  }
  .body {
    margin: 4px 0 8px 28px;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: var(--bg-code);
    padding: 8px 12px 10px;
  }
  .label {
    font-size: 11.5px;
    color: var(--text-4);
    margin: 4px 0 4px;
  }
  pre {
    margin: 0 0 6px;
    font-family: var(--mono);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-2);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 360px;
    overflow: auto;
  }
  pre.err {
    color: var(--danger);
  }
</style>
