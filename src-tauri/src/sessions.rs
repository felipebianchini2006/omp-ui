//! Leitura direta dos arquivos de sessão do OMP (`~/.omp/agent/sessions/<pasta>/<arquivo>.jsonl`).
//!
//! Cada arquivo é um JSONL. As primeiras linhas trazem `title` e `session` (id, cwd).
//! As demais formam uma árvore por `id`/`parentId`; o ramo ativo é o caminho da última
//! entrada até a raiz.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub cwd: String,
    pub path: String,
    /// Última modificação do arquivo, em ms desde a época Unix.
    pub updated: u64,
}

pub fn list(root: &Path) -> Vec<SessionInfo> {
    let mut out = Vec::new();
    let Ok(dirs) = fs::read_dir(root) else { return out };
    for dir in dirs.flatten() {
        let Ok(files) = fs::read_dir(dir.path()) else { continue };
        for f in files.flatten() {
            let path = f.path();
            // Subpastas guardam sessões de subagentes; só os .jsonl de topo são conversas.
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            if let Some(info) = summarize(&path) {
                out.push(info);
            }
        }
    }
    out.sort_by(|a, b| b.updated.cmp(&a.updated));
    out
}

fn summarize(path: &Path) -> Option<SessionInfo> {
    let meta = fs::metadata(path).ok()?;
    let updated = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    let reader = BufReader::new(File::open(path).ok()?);
    let (mut id, mut cwd, mut title) = (None, None, None);
    let mut first_prompt = None;
    for line in reader.lines().map_while(Result::ok) {
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        match v["type"].as_str() {
            Some("title") => title = v["title"].as_str().map(str::to_string),
            Some("session") => {
                id = v["id"].as_str().map(str::to_string);
                cwd = v["cwd"].as_str().map(str::to_string);
                if title.is_none() {
                    title = v["title"].as_str().map(str::to_string);
                }
            }
            Some("message") if v["message"]["role"] == "user" => {
                first_prompt = Some(text_of(&v["message"]["content"]));
                break;
            }
            _ => {}
        }
    }
    // Sessões sem nenhuma mensagem do usuário não aparecem na lista.
    let first_prompt = first_prompt?;
    let title = title
        .map(|t| strip_private_glyphs(&t))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| first_prompt.chars().take(80).collect());
    Some(SessionInfo {
        id: id?,
        title,
        cwd: cwd?,
        path: path.to_string_lossy().into(),
        updated,
    })
}

/// Remove ícones de fontes Nerd Font (área de uso privado), que o OMP põe em alguns títulos.
fn strip_private_glyphs(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(*c as u32, 0xE000..=0xF8FF | 0xF0000..=0x10FFFF))
        .collect::<String>()
        .trim()
        .to_string()
}

fn text_of(content: &Value) -> String {
    match content {
        Value::String(s) => s.trim().to_string(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|p| p["text"].as_str())
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string(),
        _ => String::new(),
    }
}

/// Mensagens do ramo ativo, na ordem da conversa.
pub fn read_messages(path: &Path) -> Result<Vec<Value>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut entries: HashMap<String, Value> = HashMap::new();
    let mut last_id = None;
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        let Some(id) = v["id"].as_str().map(str::to_string) else { continue };
        if v["type"] == "session" {
            continue;
        }
        last_id = Some(id.clone());
        entries.insert(id, v);
    }
    let mut chain = Vec::new();
    let mut cursor = last_id;
    while let Some(id) = cursor {
        let Some(entry) = entries.remove(&id) else { break };
        cursor = entry["parentId"].as_str().map(str::to_string);
        if entry["type"] == "message" {
            chain.push(entry["message"].clone());
        }
    }
    chain.reverse();
    Ok(chain)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write(dir: &Path, name: &str, lines: &[&str]) -> std::path::PathBuf {
        let p = dir.join(name);
        let mut f = File::create(&p).unwrap();
        for l in lines {
            writeln!(f, "{l}").unwrap();
        }
        p
    }

    #[test]
    fn segue_ramo_ativo_e_ignora_ramo_abandonado() {
        let dir = std::env::temp_dir().join(format!("omp-ui-test-{}", std::process::id()));
        let proj = dir.join("proj");
        fs::create_dir_all(&proj).unwrap();
        let title = format!(r#"{{"type":"title","title":"{} Minha sessão"}}"#, '\u{f03a4}');
        let p = write(
            &proj,
            "s.jsonl",
            &[
                &title,
                r#"{"type":"session","id":"abc","cwd":"/tmp/x"}"#,
                r#"{"type":"message","id":"1","parentId":null,"message":{"role":"user","content":[{"type":"text","text":"oi"}]}}"#,
                r#"{"type":"message","id":"2","parentId":"1","message":{"role":"assistant","content":[{"type":"text","text":"ramo velho"}]}}"#,
                r#"{"type":"message","id":"3","parentId":"1","message":{"role":"assistant","content":[{"type":"text","text":"ramo novo"}]}}"#,
            ],
        );
        write(&proj, "vazia.jsonl", &[r#"{"type":"session","id":"z","cwd":"/tmp/x"}"#]);

        let msgs = read_messages(&p).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[1]["content"][0]["text"], "ramo novo");

        let list = list(&dir);
        assert_eq!(list.len(), 1, "sessão sem prompt do usuário deve ficar de fora");
        assert_eq!(list[0].title, "Minha sessão");
        assert_eq!(list[0].cwd, "/tmp/x");
        fs::remove_dir_all(&dir).unwrap();
    }
}
