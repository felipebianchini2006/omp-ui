# OMP UI

Interface desktop para o [OMP](https://github.com/can1357/oh-my-pi) no estilo da aba Código do app do Claude.

- Núcleo em Rust (Tauri 2), interface em Svelte na WebView nativa do macOS. App de ~3,4 MB.
- Cada conversa roda um processo `omp --mode rpc --approval-mode yolo --auto-approve` (sempre bypass de permissões).
- Modelo, papéis, extensões e skills vêm da configuração do próprio OMP (`~/.omp/agent/config.yml`).
- A barra lateral lê as sessões de `~/.omp/agent/sessions`, agrupadas por projeto. Abrir uma sessão só lê o arquivo; o processo `omp --resume` sobe quando você envia uma mensagem.

## Uso

```bash
bun install
bun run app:build   # gera src-tauri/target/release/bundle/macos/OMP.app
bun run app:dev     # modo desenvolvimento
bun run dev         # só a interface no navegador, com dados simulados
```

Atalhos: `Enter` envia, `Shift+Enter` quebra linha, `Esc` interrompe, `Cmd+N` nova sessão, `/` lista comandos do OMP.
Enviar durante a execução manda a mensagem como `steer`.

## Testes

```bash
cd src-tauri && cargo test -- --include-ignored   # o teste ignorado sobe um omp real
bun run check
```
