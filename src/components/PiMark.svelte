<script lang="ts">
  // Marca do pi (pi.dev, press kit). O OMP é um fork do pi.
  let { size = 14 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 560 560" fill="currentColor" aria-label="pi">
  <path d="M420 280H280V140H0V0H420V280Z" />
  <path d="M560 560H420V280H560V560Z" />
  <path d="M140 560H0V140H140V280H280V420H140V560Z" />
</svg>
