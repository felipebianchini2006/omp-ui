<script lang="ts">
  import Icon from "./Icon.svelte";
  import { store } from "../lib/store.svelte";
  import type { SessionInfo } from "../lib/bridge";

  const PAGE = 8;
  let expanded = $state<Record<string, boolean>>({});

  const activeId = $derived(store.active?.sessionId ?? null);
  const draftActive = $derived(store.active?.isDraft ?? false);
  const version = $derived(store.info?.ompVersion.replace(/^omp\//, "OMP ") ?? "");
  const user = $derived(store.info?.user ?? "");

  function visible(list: SessionInfo[], cwd: string) {
    return expanded[cwd] || store.search ? list : list.slice(0, PAGE);
  }
</script>

<aside class="sidebar">
  <div class="topbar" data-tauri-drag-region>
    <div class="lights" data-tauri-drag-region></div>
    <button class="icon-btn" title="Ocultar barra lateral" onclick={() => (store.sidebarOpen = false)}>
      <Icon name="sidebar" size={17} />
    </button>
    <button class="icon-btn" title="Voltar" disabled={!store.canBack} onclick={() => store.goBack()}>
      <Icon name="left" size={17} />
    </button>
    <button class="icon-btn" title="Avançar" disabled={!store.canFwd} onclick={() => store.goForward()}>
      <Icon name="right" size={17} />
    </button>
  </div>

  <label class="search">
    <Icon name="search" size={15} />
    <input placeholder="Procurar" bind:value={store.search} spellcheck="false" />
  </label>

  <button class="nav new" class:on={draftActive} onclick={() => store.newDraft()}>
    <Icon name="plus" size={15} />
    <span>Novo</span>
  </button>

  <div class="projects">
    {#each store.projects as p (p.cwd)}
      {@const open = store.isOpen(p.cwd) || !!store.search}
      <div class="project">
        <div class="project-head">
          <button class="project-name" title={p.cwd} onclick={() => store.toggleProject(p.cwd)}>
            <span>{p.name}</span>
            <span class="chev" class:open><Icon name="chevron" size={13} /></span>
          </button>
          <button class="icon-btn small" title="Nova sessão em {p.name}" onclick={() => store.newDraft(p.cwd)}>
            <Icon name="plus" size={15} />
          </button>
        </div>
        {#if open}
          {#each visible(p.sessions, p.cwd) as s (s.id)}
            <button class="session" class:on={activeId === s.id} title={s.title} onclick={() => store.openSession(s)}>
              <span class="dot">
                {#if store.isBusy(s)}
                  <span class="spinner"></span>
                {:else if store.isUnread(s)}
                  <span class="unread"></span>
                {:else}
                  <Icon name="circle" size={13} />
                {/if}
              </span>
              <span class="title">{s.title}</span>
            </button>
          {/each}
          {#if !store.search && p.sessions.length > PAGE}
            <button class="more" onclick={() => (expanded[p.cwd] = !expanded[p.cwd])}>
              {expanded[p.cwd] ? "Mostrar menos" : `Mostrar mais (${p.sessions.length - PAGE})`}
            </button>
          {/if}
        {/if}
      </div>
    {:else}
      <div class="empty">{store.search ? "Nada encontrado" : "Nenhuma sessão ainda"}</div>
    {/each}
  </div>

  <div class="footer">
    <span class="avatar">{(user[0] ?? "?").toUpperCase()}</span>
    <span class="who">{user.split(" ")[0]}</span>
    {#if version}<span class="ver">· {version}</span>{/if}
  </div>
</aside>

<style>
  .sidebar {
    width: 288px;
    flex: none;
    display: flex;
    flex-direction: column;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border-soft);
    height: 100%;
    min-height: 0;
  }
  .topbar {
    height: 50px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 10px;
  }
  .lights {
    width: 70px;
    height: 100%;
  }
  .search {
    margin: 0 8px 4px;
    height: 32px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border-radius: 8px;
    background: var(--bg-input);
    color: var(--text-3);
  }
  .search:focus-within {
    box-shadow: inset 0 0 0 1px var(--border);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    font-size: var(--fs-body);
    color: var(--text);
  }
  .search input::placeholder {
    color: var(--text-3);
  }
  .nav {
    margin: 0 8px;
    height: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    border-radius: 8px;
    font-size: var(--fs-body);
    color: var(--text);
  }
  .nav:hover {
    background: var(--bg-hover);
  }
  .nav.on {
    background: var(--bg-active);
  }
  .projects {
    flex: 1;
    overflow-y: auto;
    padding: 18px 8px 12px;
  }
  .project {
    margin-bottom: 6px;
  }
  .project-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px 0 4px;
    height: 30px;
  }
  .project-name {
    display: flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    font-size: 13px;
    color: var(--text-3);
    padding: 3px 6px;
    border-radius: 6px;
  }
  .project-name span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-name:hover {
    color: var(--text-2);
  }
  .chev {
    display: inline-flex;
    transition: transform 0.12s ease, opacity 0.12s;
  }
  .chev.open {
    transform: rotate(90deg);
    opacity: 0;
  }
  .project-name:hover .chev {
    opacity: 1;
  }
  .project-head .icon-btn.small {
    width: 24px;
    height: 24px;
    opacity: 0.85;
  }
  .session {
    width: 100%;
    height: 30px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 8px 0 10px;
    border-radius: 8px;
    text-align: left;
    color: var(--text-2);
    font-size: var(--fs-body);
  }
  .session:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .session.on {
    background: var(--bg-active);
    color: var(--text);
  }
  .dot {
    width: 14px;
    display: grid;
    place-items: center;
    color: var(--text-4);
    flex: none;
  }
  .unread {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--blue);
  }
  .title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: clip;
    mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
  }
  .more {
    font-size: var(--fs-footnote);
    color: var(--text-3);
    padding: 5px 10px 5px 33px;
  }
  .more:hover {
    color: var(--text);
  }
  .empty {
    color: var(--text-3);
    font-size: var(--fs-footnote);
    padding: 8px 12px;
  }
  .footer {
    height: 52px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 16px;
    font-size: var(--fs-body);
  }
  .avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--bg-chip);
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: var(--wght-medium);
    color: var(--text-2);
  }
  .ver {
    color: var(--text-3);
    font-size: var(--fs-footnote);
  }
</style>
