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
                  <Icon name="circle" size={14} />
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
    height: 52px;
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
    margin: 2px 10px 6px;
    height: 34px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border-radius: 8px;
    background: var(--bg-input);
    border: 1px solid var(--border-soft);
    color: var(--text-3);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: none;
    font-size: 14px;
    color: var(--text);
  }
  .search input::placeholder {
    color: var(--text-3);
  }
  .nav {
    margin: 0 8px;
    height: 34px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    border-radius: 8px;
    font-size: 14.5px;
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
    padding: 14px 8px 12px;
  }
  .project {
    margin-bottom: 10px;
  }
  .project-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px 0 4px;
    height: 32px;
  }
  .project-name {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    font-size: 13.5px;
    color: var(--text-3);
    padding: 4px 4px;
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
    transition: transform 0.12s ease;
  }
  .chev.open {
    transform: rotate(90deg);
    opacity: 0;
  }
  .project-name:hover .chev {
    opacity: 1;
  }
  .icon-btn.small {
    width: 24px;
    height: 24px;
  }
  .session {
    width: 100%;
    height: 32px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 8px;
    border-radius: 8px;
    text-align: left;
    color: var(--text-2);
    font-size: 14px;
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
    width: 16px;
    display: grid;
    place-items: center;
    color: var(--text-4);
    flex: none;
  }
  .unread {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--blue);
  }
  .title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    mask-image: linear-gradient(to right, #000 85%, transparent);
  }
  .more {
    font-size: 12.5px;
    color: var(--text-4);
    padding: 4px 10px 4px 33px;
  }
  .more:hover {
    color: var(--text-2);
  }
  .empty {
    color: var(--text-4);
    font-size: 13px;
    padding: 8px 12px;
  }
  .footer {
    height: 52px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border-top: 1px solid var(--border-soft);
    font-size: 14px;
  }
  .avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--bg-strong);
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
  }
  .ver {
    color: var(--text-4);
    font-size: 12.5px;
  }
</style>
