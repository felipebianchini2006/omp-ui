<script lang="ts">
  import Icon from "./Icon.svelte";
  import { store, basename, tildify } from "../lib/store.svelte";
  import { api } from "../lib/bridge";
  import { prettyModel, type Attachment, type Conversation } from "../lib/conversation.svelte";

  let { conv }: { conv: Conversation } = $props();

  const EFFORT_LABEL: Record<string, string> = {
    auto: "Automático",
    off: "Desligado",
    minimal: "Mínimo",
    low: "Baixo",
    medium: "Médio",
    high: "Alto",
    xhigh: "Muito alto",
    max: "Máximo",
  };

  let text = $state("");
  let images = $state<Attachment[]>([]);
  let ta: HTMLTextAreaElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let menu = $state<"folder" | "effort" | null>(null);
  let slashIndex = $state(0);
  let composing = false;

  const modelName = $derived(conv.model?.name ? shortName(conv.model.name) : prettyModel(store.info?.defaultModel ?? ""));
  const efforts = $derived(["auto", ...(conv.model?.efforts?.length ? conv.model.efforts : ["low", "medium", "high", "xhigh", "max"]), "off"]);
  const effortLabel = $derived(EFFORT_LABEL[conv.thinkingLevel] ?? (conv.thinkingLevel || "Automático"));
  type SlashItem = { label: string; insert: string; hint?: string; desc?: string };
  const slashMatches = $derived.by((): SlashItem[] => {
    const sub = text.match(/^\/(\S+) (\S*)$/);
    if (sub) {
      const cmd = conv.commands.find((c) => c.name === sub[1]);
      const q = sub[2].toLowerCase();
      return (cmd?.subcommands ?? [])
        .filter((x) => x.name.toLowerCase().startsWith(q) && x.name !== sub[2])
        .map((x) => ({ label: `/${cmd!.name} ${x.name}`, insert: `/${cmd!.name} ${x.name}`, desc: x.description }));
    }
    const m = text.match(/^\/(\S*)$/);
    if (!m) return [];
    const q = m[1].toLowerCase();
    const starts = conv.commands.filter((c) => c.name.toLowerCase().startsWith(q));
    const contains = q ? conv.commands.filter((c) => !starts.includes(c) && c.name.toLowerCase().includes(q)) : [];
    return [...starts, ...contains].slice(0, 50).map((c) => ({
      label: `/${c.name}`,
      insert: `/${c.name}${c.hint || c.subcommands?.length ? " " : ""}`,
      hint: c.hint,
      desc: c.description,
    }));
  });
  const canSend = $derived(text.trim().length > 0 || images.length > 0);
  const ring = $derived(Math.min(100, Math.max(0, conv.contextPercent ?? 0)));

  function shortName(n: string) {
    return n.replace(/^Claude\s+/i, "");
  }

  $effect(() => {
    // Foca o campo ao trocar de conversa.
    conv;
    queueMicrotask(() => ta?.focus());
  });

  $effect(() => {
    text;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 320) + "px";
  });

  $effect(() => {
    slashMatches;
    slashIndex = 0;
  });

  $effect(() => {
    // Sem lista de comandos ainda: sobe o omp para ele anunciar os comandos disponíveis.
    if (text.startsWith("/") && conv.commands.length === 0 && !conv.running) conv.ensureRunning().catch(() => {});
  });

  async function submit() {
    if (!canSend) return;
    const t = text;
    const imgs = images;
    text = "";
    images = [];
    await store.send(conv, t, imgs);
  }

  function onKey(e: KeyboardEvent) {
    if (composing || e.isComposing) return;
    if (slashMatches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        slashIndex = (slashIndex + d + slashMatches.length) % slashMatches.length;
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && text.trimEnd() !== slashMatches[slashIndex].insert.trimEnd())) {
        e.preventDefault();
        pickSlash(slashMatches[slashIndex].insert);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        text = "";
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && conv.busy) {
      conv.abort();
    }
  }

  function pickSlash(insert: string) {
    text = insert;
    ta?.focus();
  }

  $effect(() => {
    // Mantém o item destacado visível ao navegar com as setas.
    slashIndex;
    document.querySelector(".slash .menu-item.on")?.scrollIntoView({ block: "nearest" });
  });

  function readFile(f: File): Promise<Attachment> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res({ name: f.name, mimeType: f.type, data: String(r.result).split(",")[1] ?? "" });
      r.onerror = () => rej(r.error);
      r.readAsDataURL(f);
    });
  }

  async function addFiles(files: Iterable<File>) {
    for (const f of files) if (f.type.startsWith("image/")) images = [...images, await readFile(f)];
  }

  function onPaste(e: ClipboardEvent) {
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  async function chooseFolder() {
    menu = null;
    const dir = await api.pickFolder(conv.cwd);
    if (dir) store.setDraftCwd(conv, dir);
  }
</script>

<svelte:window onclick={() => (menu = null)} />

<div class="composer-wrap">
  {#if conv.isDraft}
  <div class="chips">
    <span class="chip static"><Icon name="laptop" size={15} /> Local</span>
    <div class="anchor">
      <button
        class="chip"
        title={tildify(conv.cwd, store.info?.home)}
        onclick={(e) => {
          e.stopPropagation();
          menu = menu === "folder" ? null : "folder";
        }}>
        <Icon name="folder" size={15} />
        {basename(conv.cwd)}
      </button>
      {#if menu === "folder"}
        <div class="menu up" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
          <div class="menu-label">Projetos recentes</div>
          {#each store.recentCwds as dir}
            <button class="menu-item" class:on={dir === conv.cwd} onclick={() => { store.setDraftCwd(conv, dir); menu = null; }}>
              <Icon name="folder" size={14} />
              <span class="grow">{basename(dir)}</span>
              <span class="dim">{tildify(dir, store.info?.home).replace(/\/[^/]+$/, "")}</span>
            </button>
          {/each}
          <div class="menu-sep"></div>
          <button class="menu-item" onclick={chooseFolder}>
            <Icon name="folderPlus" size={14} /> Escolher pasta…
          </button>
        </div>
      {/if}
    </div>
  </div>
  {/if}

  <div class="box" class:busy={conv.busy} class:compact={!conv.isDraft}>
    {#if slashMatches.length}
      <div class="menu slash" role="listbox">
        {#each slashMatches as c, i (c.label)}
          <button
            class="menu-item"
            class:on={i === slashIndex}
            onmousemove={() => (slashIndex = i)}
            onmousedown={(e) => {
              e.preventDefault();
              pickSlash(c.insert);
            }}>
            <span class="cmd">{c.label}</span>
            {#if c.hint}<span class="dim">{c.hint}</span>{/if}
            <span class="desc">{c.desc ?? ""}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if images.length}
      <div class="thumbs">
        {#each images as img, i}
          <div class="thumb">
            <img src="data:{img.mimeType};base64,{img.data}" alt={img.name} />
            <button class="rm" title="Remover" onclick={() => (images = images.filter((_, j) => j !== i))}>
              <Icon name="x" size={11} stroke={2.2} />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <textarea
      bind:this={ta}
      bind:value={text}
      rows="1"
      class="selectable"
      placeholder={conv.busy ? "Enviar mensagem durante a execução…" : "Descreva uma tarefa ou digite / para comandos"}
      spellcheck="false"
      onkeydown={onKey}
      oncompositionstart={() => (composing = true)}
      oncompositionend={() => (composing = false)}
      onpaste={onPaste}></textarea>

    <div class="box-foot">
      {#if conv.busy}
        <button class="send stop" title="Parar (Esc)" onclick={() => conv.abort()}>
          <Icon name="stop" size={14} />
        </button>
      {:else}
        <button class="send" class:ready={canSend} title="Enviar (Enter)" disabled={!canSend} onclick={submit}>
          <Icon name="return" size={16} />
        </button>
      {/if}
    </div>
  </div>

  <div class="row">
    <div class="left">
      <button class="icon-btn" title="Anexar imagem" onclick={() => fileInput?.click()}>
        <Icon name="plus" size={17} />
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onchange={(e) => {
          const t = e.currentTarget;
          addFiles(t.files ?? []);
          t.value = "";
        }} />
      {#each Object.entries(conv.statuses) as [k, v] (k)}
        <span class="status" title={k}>{v}</span>
      {/each}
    </div>
    <div class="right">
      <span class="model" title={conv.model?.id ?? store.info?.defaultModel}>{modelName}</span>
      <div class="anchor">
        <button
          class="effort"
          onclick={(e) => {
            e.stopPropagation();
            menu = menu === "effort" ? null : "effort";
          }}>{effortLabel}</button>
        {#if menu === "effort"}
          <div class="menu up right-align" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
            <div class="menu-label">Esforço de raciocínio</div>
            {#each efforts as lv}
              <button class="menu-item" class:on={lv === conv.thinkingLevel} onclick={() => { conv.setThinking(lv); menu = null; }}>
                <span class="grow">{EFFORT_LABEL[lv] ?? lv}</span>
                {#if lv === conv.thinkingLevel}<Icon name="check" size={14} />{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <span class="ring" title={conv.contextPercent != null ? `Contexto: ${ring.toFixed(1)}%` : "Contexto"}>
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--text-4)" stroke-width="1.6" opacity="0.6" />
          <circle
            cx="8"
            cy="8"
            r="6.2"
            fill="none"
            stroke="var(--text-2)"
            stroke-width="1.6"
            stroke-dasharray={`${(ring / 100) * 38.96} 38.96`}
            transform="rotate(-90 8 8)" />
        </svg>
      </span>
    </div>
  </div>
</div>

<style>
  .composer-wrap {
    width: 100%;
    max-width: 768px;
    margin: 0 auto;
  }
  .chips {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }
  .anchor {
    position: relative;
  }
  .chip {
    height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px 0 9px;
    border-radius: 7px;
    background: var(--bg-chip);
    font-size: var(--fs-body);
    color: var(--text-2);
  }
  .chip :global(svg) {
    color: var(--text-3);
  }
  button.chip:hover {
    color: var(--text);
    background: color-mix(in srgb, var(--bg-chip) 80%, white 8%);
  }
  .menu.up {
    bottom: calc(100% + 6px);
    left: 0;
    min-width: 300px;
  }
  .menu.up.right-align {
    left: auto;
    right: 0;
    min-width: 210px;
  }
  .grow {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dim {
    color: var(--text-3);
    font-size: var(--fs-footnote);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }
  .box {
    position: relative;
    background: var(--bg-composer);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 13px 12px 8px 15px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    transition: border-color 0.15s;
  }
  .box:focus-within {
    border-color: var(--border-strong);
  }
  textarea {
    display: block;
    width: 100%;
    min-height: 52px;
    resize: none;
    border: 0;
    outline: 0;
    background: none;
    font-size: var(--fs-prose);
    line-height: 1.55;
    color: var(--text);
    padding: 0;
    caret-color: var(--text);
  }
  .compact textarea {
    min-height: 24px;
  }
  textarea::placeholder {
    color: var(--text-4);
  }
  .box-foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 2px;
  }
  .send {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    color: var(--text-4);
  }
  .send.ready {
    color: var(--text-2);
  }
  .send.ready:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .send.stop {
    background: var(--text);
    color: var(--bg-main);
    border-radius: 50%;
    width: 26px;
    height: 26px;
  }
  .slash {
    left: 0;
    right: 0;
    bottom: calc(100% + 6px);
    max-height: 320px;
  }
  .cmd {
    font-family: var(--mono);
    font-size: var(--fs-code);
    color: var(--text);
    white-space: nowrap;
  }
  .desc {
    color: var(--text-3);
    font-size: var(--fs-footnote);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    flex: 1;
    text-align: right;
  }
  .thumbs {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .thumb {
    position: relative;
    width: 60px;
    height: 60px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .rm {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    display: grid;
    place-items: center;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    padding: 0 4px 0 2px;
    min-height: 28px;
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .status {
    font-size: var(--fs-footnote);
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .model,
  .effort {
    font-size: var(--fs-body);
    color: var(--text-2);
    padding: 3px 7px;
    border-radius: 6px;
    white-space: nowrap;
  }
  .effort:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .ring {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
  }
</style>
