<script lang="ts">
  import Sidebar from "./components/Sidebar.svelte";
  import Composer from "./components/Composer.svelte";
  import Transcript from "./components/Transcript.svelte";
  import UiPrompt from "./components/UiPrompt.svelte";
  import Icon from "./components/Icon.svelte";
  import { store, basename, tildify } from "./lib/store.svelte";

  let bootError = $state<string | null>(null);
  store.init().catch((e) => (bootError = String(e)));

  const conv = $derived(store.active);

  function onKey(e: KeyboardEvent) {
    if (e.metaKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      store.newDraft();
    }
  }
</script>

<svelte:window onkeydown={onKey} onfocus={() => store.refresh()} />

<div class="shell">
  {#if store.sidebarOpen}
    <Sidebar />
  {/if}

  <main>
    <header data-tauri-drag-region class:closed={!store.sidebarOpen}>
      {#if !store.sidebarOpen}
        <div class="lights" data-tauri-drag-region></div>
        <button class="icon-btn" title="Mostrar barra lateral" onclick={() => (store.sidebarOpen = true)}>
          <Icon name="sidebar" size={17} />
        </button>
      {/if}
      {#if conv && !conv.isDraft}
        <div class="heading" data-tauri-drag-region>
          <span class="htitle">{conv.title || "Nova sessão"}</span>
          <span class="hpath" title={conv.cwd}>{tildify(conv.cwd, store.info?.home)}</span>
        </div>
      {/if}
    </header>

    {#if bootError}
      <div class="boot-error selectable">{bootError}</div>
    {:else if conv}
      {#if conv.isDraft}
        <div class="draft">
          <div class="draft-space"></div>
          <Composer {conv} />
          <div class="draft-hint">
            Sessões rodam em <code>{basename(conv.cwd)}</code> com o modelo e as configurações do OMP.
          </div>
        </div>
      {:else}
        {#key conv.key}
          <Transcript {conv} />
        {/key}
        <div class="dock">
          {#each conv.uiRequests as req (req.id)}
            <UiPrompt {conv} {req} />
          {/each}
          <Composer {conv} />
        </div>
      {/if}
    {/if}
  </main>
</div>

<style>
  .shell {
    display: flex;
    height: 100%;
  }
  main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-main);
  }
  header {
    height: 52px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 16px;
  }
  .lights {
    width: 70px;
    height: 100%;
  }
  .heading {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    padding-left: 8px;
  }
  .htitle {
    font-size: 14.5px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hpath {
    font-size: 12.5px;
    color: var(--text-4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .draft {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 32px 28px;
    min-height: 0;
  }
  .draft-space {
    flex: 1 1 58%;
    min-height: 24px;
  }
  .draft-hint {
    flex: 1 1 42%;
    text-align: center;
    font-size: 12.5px;
    color: var(--text-4);
    padding-top: 18px;
  }
  .draft-hint code {
    font-family: var(--mono);
    font-size: 12px;
  }
  .dock {
    flex: none;
    padding: 4px 32px 22px;
  }
  .boot-error {
    margin: 40px auto;
    max-width: 640px;
    color: var(--danger);
    font-family: var(--mono);
    font-size: 13px;
    white-space: pre-wrap;
  }
</style>
