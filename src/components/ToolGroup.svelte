<script lang="ts">
  // Ferramentas seguidas viram uma linha-resumo, como no Claude ("Leu 3 arquivos, executou 2 comandos").
  import Icon from "./Icon.svelte";
  import ToolCall from "./ToolCall.svelte";
  import type { Conversation, GroupEntry } from "../lib/conversation.svelte";

  let { entries, conv, live }: { entries: GroupEntry[]; conv: Conversation; live: boolean } = $props();

  let open = $state(false);

  const PHRASES: Record<string, [string, string, string]> = {
    read: ["leu", "arquivo", "arquivos"],
    edit: ["editou", "arquivo", "arquivos"],
    write: ["escreveu", "arquivo", "arquivos"],
    bash: ["executou", "comando", "comandos"],
    grep: ["fez", "busca", "buscas"],
    glob: ["fez", "busca", "buscas"],
    find: ["fez", "busca", "buscas"],
    web_search: ["fez", "pesquisa na web", "pesquisas na web"],
    fetch: ["abriu", "página", "páginas"],
    task: ["rodou", "subagente", "subagentes"],
    todo: ["atualizou", "lista de tarefas", "listas de tarefas"],
  };

  const calls = $derived(entries.filter((e) => e.kind === "tool").map((e) => (e as any).call));
  const running = $derived(calls.some((c) => statusOf(c) === "running"));
  const failed = $derived(calls.filter((c) => statusOf(c) === "error").length);

  function statusOf(c: any) {
    const run = conv.runs[c.id];
    const res = conv.results[c.id];
    return run?.status ?? (res ? (res.isError ? "error" : "done") : live ? "running" : "done");
  }

  const summary = $derived.by(() => {
    const groups = new Map<string, number>();
    for (const c of calls) {
      const key = PHRASES[c.name] ? c.name.replace(/^(glob|find)$/, "grep").replace(/^write$/, "edit") : "_";
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const parts = [...groups].map(([k, n]) => {
      if (k === "_") return `usou ${n} ${n === 1 ? "ferramenta" : "ferramentas"}`;
      const [verb, one, many] = PHRASES[k];
      return `${verb} ${n} ${n === 1 ? one : many}`;
    });
    const text = parts.join(", ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  });
</script>

<div class="group">
  <button class="head" class:open onclick={() => (open = !open)}>
    <span class="ico">
      {#if running}<span class="spinner"></span>{:else}<Icon name="list" size={14} />{/if}
    </span>
    <span class="sum">{summary}</span>
    {#if failed}<span class="fail">{failed} com erro</span>{/if}
    <span class="chev"><Icon name="chevron" size={12} /></span>
  </button>
  {#if open}
    <div class="items">
      {#each entries as e}
        {#if e.kind === "tool"}
          <ToolCall call={e.call} result={conv.results[e.call.id]} run={conv.runs[e.call.id]} {live} />
        {:else}
          <div class="thought selectable">{e.text}</div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .group {
    margin: 4px 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 3px 6px 3px 2px;
    border-radius: 6px;
    font-size: var(--fs-body);
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
  .sum {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .fail {
    color: var(--danger);
    font-size: var(--fs-footnote);
    flex: none;
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
  .items {
    margin: 2px 0 6px 9px;
    padding-left: 12px;
    border-left: 1px solid var(--border);
  }
  .thought {
    font-size: var(--fs-footnote);
    color: var(--text-3);
    white-space: pre-wrap;
    padding: 4px 0 6px 2px;
    max-height: 160px;
    overflow: auto;
  }
</style>
