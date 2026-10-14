<script lang="ts">
  import { Marked } from "marked";
  import DOMPurify from "dompurify";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { inTauri } from "../lib/bridge";

  let { text }: { text: string } = $props();

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const md = new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }) {
        const l = (lang ?? "").split(/\s/)[0];
        return `<div class="code"><div class="code-head"><span>${esc(l)}</span><button class="copy" data-copy>Copiar</button></div><pre><code>${esc(text)}</code></pre></div>`;
      },
    },
  });

  const html = $derived(DOMPurify.sanitize(md.parse(text ?? "", { async: false }) as string));

  function onClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    const copy = el.closest("[data-copy]");
    if (copy) {
      const code = copy.closest(".code")?.querySelector("code")?.textContent ?? "";
      navigator.clipboard.writeText(code);
      copy.textContent = "Copiado";
      setTimeout(() => (copy.textContent = "Copiar"), 1200);
      return;
    }
    const a = el.closest("a");
    if (a?.href) {
      e.preventDefault();
      if (inTauri) openUrl(a.href);
      else window.open(a.href, "_blank");
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div class="md selectable" role="document" onclick={onClick}>{@html html}</div>

<style>
  .md {
    font-size: var(--fs-prose);
    line-height: 1.6;
    color: var(--text);
    overflow-wrap: anywhere;
  }
  .md :global(p) {
    margin: 0 0 0.75em;
  }
  .md :global(> :last-child) {
    margin-bottom: 0;
  }
  .md :global(h1),
  .md :global(h2),
  .md :global(h3),
  .md :global(h4) {
    font-weight: 560;
    line-height: 1.35;
    margin: 1.3em 0 0.5em;
  }
  .md :global(h1) {
    font-size: 1.35em;
  }
  .md :global(h2) {
    font-size: 1.2em;
  }
  .md :global(h3) {
    font-size: 1.05em;
  }
  .md :global(ul),
  .md :global(ol) {
    margin: 0 0 0.75em;
    padding-left: 1.4em;
  }
  .md :global(li) {
    margin: 0.2em 0;
  }
  .md :global(a) {
    color: var(--blue);
    text-decoration: none;
  }
  .md :global(a:hover) {
    text-decoration: underline;
  }
  .md :global(strong) {
    font-weight: 560;
  }
  .md :global(:not(pre) > code) {
    font-family: var(--mono);
    font-size: 0.85em;
    background: var(--alpha-1);
    border: 1px solid var(--border-soft);
    border-radius: 5px;
    padding: 0.08em 0.35em;
    color: var(--text);
  }
  .md :global(.code) {
    margin: 0.4em 0 0.9em;
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    background: var(--bg-raised);
    overflow: hidden;
  }
  .md :global(.code-head) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    font-size: var(--fs-caption);
    color: var(--text-3);
    font-family: var(--mono);
    border-bottom: 1px solid var(--border-soft);
  }
  .md :global(.copy) {
    font-family: var(--font);
    font-size: 12px;
    color: var(--text-3);
  }
  .md :global(.copy:hover) {
    color: var(--text);
  }
  .md :global(pre) {
    margin: 0;
    padding: 10px 14px 12px;
    overflow-x: auto;
    font-family: var(--mono);
    font-size: var(--fs-code);
    line-height: 1.55;
  }
  .md :global(blockquote) {
    margin: 0 0 0.75em;
    padding-left: 12px;
    border-left: 3px solid var(--border);
    color: var(--text-2);
  }
  .md :global(table) {
    border-collapse: collapse;
    margin: 0.4em 0 0.9em;
    font-size: 14px;
    display: block;
    overflow-x: auto;
  }
  .md :global(th),
  .md :global(td) {
    border: 1px solid var(--border);
    padding: 6px 10px;
    text-align: left;
  }
  .md :global(th) {
    background: var(--alpha-1);
    font-weight: 560;
  }
  .md :global(hr) {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 1.2em 0;
  }
</style>
