<script lang="ts">
  import Markdown from "./Markdown.svelte";
  import ToolCall from "./ToolCall.svelte";
  import { textOf, type Conversation, type Msg } from "../lib/conversation.svelte";

  let { conv }: { conv: Conversation } = $props();

  let scroller: HTMLDivElement | undefined = $state();
  let stick = true;
  let openThinking = $state<Record<string, boolean>>({});

  // Só mensagens que fazem sentido mostrar: usuário e assistente.
  const items = $derived(conv.messages.filter(({ msg }) => msg.role === "user" || msg.role === "assistant"));
  const last = $derived(items[items.length - 1]);

  function userText(m: Msg) {
    return textOf(m.content).trim();
  }
  function userImages(m: Msg): any[] {
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

  $effect(() => {
    conv.key;
    stick = true;
  });
</script>

<div class="scroller" bind:this={scroller} onscroll={onScroll}>
  <div class="column">
    {#each items as { id, msg } (id)}
      {#if msg.role === "user"}
        {@const t = userText(msg)}
        <div class="user">
          {#each userImages(msg) as img}
            <img class="uimg" src="data:{img.mimeType};base64,{img.data}" alt="" />
          {/each}
          {#if t}<div class="bubble selectable">{t}</div>{/if}
        </div>
      {:else}
        <div class="assistant">
          {#each Array.isArray(msg.content) ? msg.content : [] as block, bi}
            {#if block.type === "text" && block.text?.trim()}
              <Markdown text={block.text} />
            {:else if block.type === "thinking" && block.thinking?.trim()}
              {@const k = `${id}:${bi}`}
              <button class="thinking" onclick={() => (openThinking[k] = !openThinking[k])}>
                {openThinking[k] ? "Ocultar raciocínio" : "Raciocínio"}
              </button>
              {#if openThinking[k]}
                <div class="thinking-body selectable">{block.thinking}</div>
              {/if}
            {:else if block.type === "toolCall"}
              <ToolCall call={block} result={conv.results[block.id]} run={conv.runs[block.id]} live={conv.busy} />
            {/if}
          {/each}
          {#if msg.stopReason === "error" && msg.errorMessage}
            <div class="error selectable">{msg.errorMessage}</div>
          {:else if msg.stopReason === "aborted"}
            <div class="note">Interrompido</div>
          {/if}
        </div>
      {/if}
    {/each}

    {#if conv.pendingPrompt}
      <div class="user"><div class="bubble pending selectable">{conv.pendingPrompt}</div></div>
    {/if}

    {#if conv.busy && (!last || last.msg.role === "user" || conv.pendingPrompt)}
      <div class="working"><span class="pulse"></span> Trabalhando…</div>
    {:else if conv.busy}
      <div class="working tail"><span class="pulse"></span></div>
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
    max-width: 760px;
    margin: 0 auto;
    padding: 24px 24px 32px;
  }
  .user {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    margin: 18px 0 20px;
  }
  .bubble {
    max-width: 85%;
    background: var(--bg-bubble);
    border-radius: 14px;
    padding: 9px 14px;
    font-size: 15.5px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .bubble.pending {
    opacity: 0.6;
  }
  .uimg {
    max-width: 220px;
    max-height: 160px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  .assistant {
    margin: 0 0 14px;
  }
  .assistant > :global(.md) {
    margin: 6px 0 10px;
  }
  .thinking {
    font-size: 13.5px;
    color: var(--text-4);
    padding: 2px 0;
    margin: 2px 0;
  }
  .thinking:hover {
    color: var(--text-2);
  }
  .thinking-body {
    font-size: 13.5px;
    color: var(--text-3);
    white-space: pre-wrap;
    border-left: 2px solid var(--border);
    padding: 2px 0 2px 12px;
    margin: 4px 0 10px;
  }
  .error {
    margin: 8px 0;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(229, 103, 90, 0.1);
    border: 1px solid rgba(229, 103, 90, 0.3);
    color: var(--danger);
    font-size: 13.5px;
    white-space: pre-wrap;
    font-family: var(--mono);
  }
  .note {
    font-size: 13px;
    color: var(--text-4);
    margin: 4px 0;
  }
  .working {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-3);
    font-size: 14px;
    margin: 10px 0;
  }
  .working.tail {
    margin-top: 4px;
  }
  .pulse {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.85);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
