<script lang="ts">
  // Pergunta feita por uma extensão do OMP (select, confirm, input, editor).
  import { untrack } from "svelte";
  import type { Conversation, UiRequest } from "../lib/conversation.svelte";

  let { conv, req }: { conv: Conversation; req: UiRequest } = $props();
  let value = $state(untrack(() => req.prefill ?? ""));

  const cancel = () => conv.answerUi(req.id, { cancelled: true });
</script>

<div class="card">
  {#if req.title}<div class="title">{req.title}</div>{/if}
  {#if req.message}<div class="msg selectable">{req.message}</div>{/if}

  {#if req.method === "select"}
    <div class="opts">
      {#each req.options ?? [] as o}
        <button class="opt" onclick={() => conv.answerUi(req.id, { value: o })}>{o}</button>
      {/each}
    </div>
    <div class="actions"><button class="btn" onclick={cancel}>Cancelar</button></div>
  {:else if req.method === "confirm"}
    <div class="actions">
      <button class="btn" onclick={() => conv.answerUi(req.id, { confirmed: false })}>Não</button>
      <button class="btn primary" onclick={() => conv.answerUi(req.id, { confirmed: true })}>Sim</button>
    </div>
  {:else}
    {#if req.method === "editor"}
      <textarea class="selectable" rows="6" bind:value></textarea>
    {:else}
      <input
        class="selectable"
        bind:value
        placeholder={req.placeholder ?? ""}
        onkeydown={(e) => e.key === "Enter" && conv.answerUi(req.id, { value })} />
    {/if}
    <div class="actions">
      <button class="btn" onclick={cancel}>Cancelar</button>
      <button class="btn primary" onclick={() => conv.answerUi(req.id, { value })}>Enviar</button>
    </div>
  {/if}
</div>

<style>
  .card {
    max-width: 760px;
    margin: 0 auto 10px;
    width: 100%;
    background: var(--bg-composer);
    border: 1px solid var(--accent);
    border-radius: 14px;
    padding: 14px 16px;
  }
  .title {
    font-weight: 600;
    margin-bottom: 4px;
  }
  .msg {
    color: var(--text-2);
    font-size: 14px;
    white-space: pre-wrap;
    margin-bottom: 10px;
  }
  .opts {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .opt {
    text-align: left;
    padding: 7px 10px;
    border-radius: 8px;
    background: var(--bg-input);
    font-size: 14px;
  }
  .opt:hover {
    background: var(--bg-active);
  }
  input,
  textarea {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    outline: 0;
    resize: vertical;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
  }
  .btn {
    padding: 6px 14px;
    border-radius: 8px;
    background: var(--bg-input);
    font-size: 14px;
  }
  .btn:hover {
    background: var(--bg-active);
  }
  .btn.primary {
    background: var(--text);
    color: var(--bg-main);
  }
</style>
