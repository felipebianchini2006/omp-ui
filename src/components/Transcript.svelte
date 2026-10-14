<script lang="ts">
  import Markdown from "./Markdown.svelte";
  import ToolCall from "./ToolCall.svelte";
  import ToolGroup from "./ToolGroup.svelte";
  import { textOf, type Conversation, type GroupEntry, type Msg } from "../lib/conversation.svelte";

  let { conv }: { conv: Conversation } = $props();

  let scroller: HTMLDivElement | undefined = $state();
  let stick = true;

  type Item =
    | { kind: "user"; id: string; text: string; images: any[] }
    | { kind: "text"; id: string; text: string }
    | { kind: "tools"; id: string; entries: GroupEntry[] }
    | { kind: "command"; id: string; text: string; level?: string }
    | { kind: "error"; id: string; text: string }
    | { kind: "note"; id: string; text: string };

  // Achata as mensagens em blocos de exibição. Ferramentas seguidas (e o raciocínio entre elas)
  // formam um grupo; texto do assistente ou nova mensagem do usuário fecham o grupo.
  const items = $derived.by(() => {
    const out: Item[] = [];
    let group: Extract<Item, { kind: "tools" }> | null = null;
    let pendingThoughts: GroupEntry[] = [];
    for (const { id, msg } of conv.messages) {
      if (msg.role === "user") {
        group = null;
        pendingThoughts = [];
        out.push({ kind: "user", id, text: textOf(msg.content).trim(), images: imagesOf(msg) });
      } else if (msg.role === "command") {
        group = null;
        out.push({ kind: "command", id, text: String(msg.content ?? ""), level: msg.level });
      } else if (msg.role === "assistant") {
        const blocks = Array.isArray(msg.content) ? msg.content : [];
        blocks.forEach((b: any, bi: number) => {
          if (b.type === "toolCall") {
            if (!group) {
              group = { kind: "tools", id: `${id}:${bi}`, entries: [] };
              out.push(group);
            }
            group.entries.push(...pendingThoughts, { kind: "tool", call: b });
            pendingThoughts = [];
          } else if (b.type === "thinking" && b.thinking?.trim()) {
            pendingThoughts.push({ kind: "thinking", text: b.thinking.trim() });
          } else if (b.type === "text" && b.text?.trim()) {
            group = null;
            pendingThoughts = [];
            out.push({ kind: "text", id: `${id}:${bi}`, text: b.text });
          }
        });
        if (msg.stopReason === "error" && msg.errorMessage) {
          group = null;
          out.push({ kind: "error", id: `${id}:err`, text: msg.errorMessage });
        } else if (msg.stopReason === "aborted") {
          group = null;
          out.push({ kind: "note", id: `${id}:abort`, text: "Interrompido" });
        }
      }
    }
    return out;
  });

  const last = $derived(items[items.length - 1]);
  const showWorking = $derived(conv.busy && (!last || last.kind === "user" || !!conv.pendingPrompt));

  function imagesOf(m: Msg): any[] {
    return Array.isArray(m.content) ? m.content.filter((c: any) => c.type === "image") : [];
  }

  function onScroll() {
    if (!scroller) return;
    stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

  $effect(() => {
    // Rola para o fim quando chega conteúdo novo, se o usuário já estava no fim.
    conv.messages;
    conv.runs;
    conv.pendingPrompt;
    if (stick && scroller) requestAnimationFrame(() => scroller && (scroller.scrollTop = scroller.scrollHeight));
  });
</script>

<div class="scroller" bind:this={scroller} onscroll={onScroll}>
  <div class="column">
    {#each items as item (item.id)}
      {#if item.kind === "user"}
        <div class="user">
          {#each item.images as img}
            <img class="uimg" src="data:{img.mimeType};base64,{img.data}" alt="" />
          {/each}
          {#if item.text}<div class="bubble selectable">{item.text}</div>{/if}
        </div>
      {:else if item.kind === "text"}
        <div class="prose"><Markdown text={item.text} /></div>
      {:else if item.kind === "tools"}
        {@const tools = item.entries.filter((e) => e.kind === "tool")}
        {#if tools.length === 1 && item.entries.length === 1}
          {@const call = (tools[0] as any).call}
          <ToolCall {call} result={conv.results[call.id]} run={conv.runs[call.id]} live={conv.busy} />
        {:else}
          <ToolGroup entries={item.entries} {conv} live={conv.busy} />
        {/if}
      {:else if item.kind === "command"}
        <div class="command selectable" class:warn={item.level === "warning"} class:err={item.level === "error"}>{item.text}</div>
      {:else if item.kind === "error"}
        <div class="error selectable">{item.text}</div>
      {:else}
        <div class="note">{item.text}</div>
      {/if}
    {/each}

    {#if conv.pendingPrompt}
      <div class="user"><div class="bubble pending selectable">{conv.pendingPrompt}</div></div>
    {/if}

    {#if conv.busy}
      <div class="working" class:tail={!showWorking}>
        <span class="spark" aria-hidden="true"></span>
        {#if showWorking}<span class="shimmer">Trabalhando…</span>{/if}
      </div>
    {/if}

    {#if conv.error}
      <div class="error selectable">{conv.error}</div>
    {/if}
  </div>
</div>

<style>
  .scroller {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .column {
    max-width: 768px;
    margin: 0 auto;
    padding: 20px 28px 28px;
  }
  .user {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    margin: 22px 0 18px;
  }
  .user:first-child {
    margin-top: 6px;
  }
  .bubble {
    max-width: 82%;
    background: var(--bg-bubble);
    border-radius: 14px;
    padding: 8px 14px;
    font-size: var(--fs-prose);
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--text);
  }
  .bubble.pending {
    opacity: 0.55;
  }
  .uimg {
    max-width: 220px;
    max-height: 160px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  .prose {
    margin: 10px 0 12px;
  }
  .command {
    margin: 6px 0 12px;
    padding: 9px 12px;
    border-radius: 10px;
    background: var(--bg-raised);
    border: 1px solid var(--border-soft);
    font-family: var(--mono);
    font-size: var(--fs-code);
    line-height: 1.55;
    color: var(--text-2);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .command.warn {
    color: #e8b85a;
  }
  .command.err {
    color: var(--danger);
  }
  .error {
    margin: 8px 0;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(240, 122, 110, 0.08);
    border: 1px solid rgba(240, 122, 110, 0.25);
    color: var(--danger);
    font-size: var(--fs-footnote);
    white-space: pre-wrap;
    font-family: var(--mono);
  }
  .note {
    font-size: var(--fs-footnote);
    color: var(--text-3);
    margin: 4px 0;
  }
  .working {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--text-3);
    font-size: var(--fs-body);
    margin: 12px 0 4px 2px;
  }
  .working.tail {
    margin-top: 6px;
  }
  /* Asterisco girando, no lugar do "spark" do Claude. */
  .spark {
    width: 13px;
    height: 13px;
    background: var(--accent);
    clip-path: polygon(
      50% 0%, 58% 38%, 93% 18%, 64% 46%, 100% 55%, 61% 60%, 80% 95%, 52% 65%, 35% 100%, 40% 62%, 4% 78%, 34% 52%, 0% 35%, 38% 40%, 22% 6%
    );
    animation: spin 2.4s linear infinite;
  }
  .shimmer {
    background: linear-gradient(90deg, var(--text-3) 0%, var(--text) 50%, var(--text-3) 100%);
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: shimmer 2s linear infinite;
  }
  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }
</style>
