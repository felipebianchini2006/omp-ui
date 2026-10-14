<script lang="ts">
  // Rodapé da barra lateral: quanto de cada plano conectado já foi usado.
  import { store } from "../lib/store.svelte";

  let open = $state(false);

  const pct = (f: number) => `${Math.round(f * 100)}%`;

  function level(f: number) {
    return f >= 0.9 ? "crit" : f >= 0.7 ? "warn" : "ok";
  }

  function windowLabel(s: string) {
    return s
      .replace(/(\d+)\s*hours?/i, "$1 h")
      .replace(/(\d+)\s*days?/i, "$1 dias")
      .replace(/weekly credits/i, "créditos semanais")
      .trim();
  }

  function resetIn(at?: number) {
    if (!at) return "";
    const ms = at - Date.now();
    if (ms <= 0) return "renovando";
    const h = Math.floor(ms / 3_600_000);
    const m = Math.round((ms % 3_600_000) / 60_000);
    if (h >= 24) return `renova em ${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ""}`;
    if (h >= 1) return `renova em ${h} h${m ? ` ${m} min` : ""}`;
    return `renova em ${m} min`;
  }
</script>

<svelte:window onclick={() => (open = false)} />

<div class="footer">
  {#if open}
    <div class="pop menu" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      {#each store.usage as p (p.id)}
        <div class="prov">
          <span>{p.name}</span>
          {#if p.plan}<span class="plan">{p.plan}</span>{/if}
        </div>
        {#each p.limits as l}
          <div class="limit">
            <div class="lrow">
              <span class="lname">{windowLabel(l.label)}</span>
              <span class="lpct {level(l.used)}">{pct(l.used)}</span>
            </div>
            <div class="bar"><span class={level(l.used)} style="width:{Math.min(100, l.used * 100)}%"></span></div>
            <div class="reset">{resetIn(l.resetsAt)}</div>
          </div>
        {/each}
      {/each}
      <button class="menu-item refresh" onclick={() => store.loadUsage(true)}>Atualizar agora</button>
    </div>
  {/if}

  <button
    class="plans"
    title="Uso dos planos conectados no OMP"
    onclick={(e) => {
      e.stopPropagation();
      open = !open;
    }}>
    {#each store.usage as p (p.id)}
      <span class="item">
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="4.6" fill="none" stroke="var(--alpha-3)" stroke-width="1.6" />
          <circle
            class={level(p.peak)}
            cx="6"
            cy="6"
            r="4.6"
            fill="none"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-dasharray={`${Math.max(0.01, p.peak) * 28.9} 28.9`}
            transform="rotate(-90 6 6)" />
        </svg>
        <span class="name">{p.name}</span>
        <span class="val {level(p.peak)}">{pct(p.peak)}</span>
      </span>
    {:else}
      <span class="item muted">Carregando planos…</span>
    {/each}
  </button>
</div>

<style>
  .footer {
    position: relative;
    height: 48px;
    flex: none;
    display: flex;
    align-items: center;
    padding: 0 8px;
  }
  .plans {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    height: 32px;
    padding: 0 8px;
    border-radius: 8px;
    overflow: hidden;
  }
  .plans:hover {
    background: var(--bg-hover);
  }
  .item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    white-space: nowrap;
    min-width: 0;
  }
  .item svg {
    flex: none;
  }
  .name {
    color: var(--text-2);
  }
  .val {
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--text-3);
  }
  circle.ok {
    stroke: var(--text-2);
  }
  circle.warn,
  .val.warn,
  .lpct.warn {
    stroke: #e8b85a;
    color: #e8b85a;
  }
  circle.crit,
  .val.crit,
  .lpct.crit {
    stroke: var(--danger);
    color: var(--danger);
  }
  .pop {
    left: 8px;
    right: 8px;
    bottom: calc(100% - 2px);
    max-height: 420px;
    padding: 6px;
  }
  .prov {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 8px 6px 2px;
    font-size: var(--fs-body);
    font-weight: var(--wght-medium);
    color: var(--text);
  }
  .plan {
    font-size: var(--fs-caption);
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .limit {
    padding: 5px 6px 4px;
  }
  .lrow {
    display: flex;
    justify-content: space-between;
    font-size: var(--fs-footnote);
    color: var(--text-2);
  }
  .lpct {
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 4px;
    border-radius: 4px;
    background: var(--alpha-2);
    margin: 5px 0 3px;
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--text-2);
  }
  .bar span.warn {
    background: #e8b85a;
  }
  .bar span.crit {
    background: var(--danger);
  }
  .reset {
    font-size: var(--fs-caption);
    color: var(--text-4);
  }
  .refresh {
    margin-top: 4px;
    justify-content: center;
    color: var(--text-3);
    font-size: var(--fs-footnote);
  }
</style>
