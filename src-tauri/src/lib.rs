mod sessions;

use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

/// Um processo `omp --mode rpc` vivo, identificado por uma chave do frontend.
struct Agent {
    child: Child,
    stdin: ChildStdin,
}

#[derive(Default)]
struct Agents(Mutex<HashMap<String, Agent>>);

/// Ambiente do shell de login do usuário. Apps abertos pelo Finder não herdam o PATH
/// do terminal, e o OMP precisa dele para rodar bash, mise, rtk etc.
static LOGIN_ENV: OnceLock<Vec<(String, String)>> = OnceLock::new();

fn login_env() -> &'static [(String, String)] {
    LOGIN_ENV.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let out = Command::new(shell)
            .args(["-ilc", "env -0"])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output();
        match out {
            Ok(o) if o.status.success() => o
                .stdout
                .split(|b| *b == 0)
                .filter_map(|kv| {
                    let s = String::from_utf8_lossy(kv);
                    let (k, v) = s.split_once('=')?;
                    // Variáveis do próprio shell interativo que não fazem sentido no filho.
                    if k.is_empty() || k == "_" || k == "SHLVL" || k == "PWD" || k == "OLDPWD" {
                        return None;
                    }
                    Some((k.trim_start_matches('\n').to_string(), v.to_string()))
                })
                .collect(),
            _ => Vec::new(),
        }
    })
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into()))
}

fn omp_bin() -> PathBuf {
    let path = login_env()
        .iter()
        .find(|(k, _)| k == "PATH")
        .map(|(_, v)| v.clone())
        .unwrap_or_default();
    for dir in path.split(':').filter(|d| !d.is_empty()) {
        let p = PathBuf::from(dir).join("omp");
        if p.is_file() {
            return p;
        }
    }
    for p in [
        "/opt/homebrew/bin/omp",
        "/usr/local/bin/omp",
    ] {
        if PathBuf::from(p).is_file() {
            return PathBuf::from(p);
        }
    }
    let bun = home().join(".bun/bin/omp");
    if bun.is_file() {
        return bun;
    }
    PathBuf::from("omp")
}

#[derive(Clone, Serialize)]
struct AgentLine {
    key: String,
    line: String,
}

#[derive(Clone, Serialize)]
struct AgentExit {
    key: String,
    code: Option<i32>,
}

/// `omp --mode rpc` sempre em bypass de permissões; modelo e config vêm do próprio OMP.
fn agent_command(cwd: &str, resume: Option<&str>) -> Command {
    let mut cmd = Command::new(omp_bin());
    cmd.args(["--mode", "rpc", "--approval-mode", "yolo", "--auto-approve"])
        .arg("--cwd")
        .arg(cwd)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(path) = resume.filter(|p| !p.is_empty()) {
        cmd.arg("--resume").arg(path);
    }
    let env = login_env();
    if !env.is_empty() {
        cmd.env_clear().envs(env.iter().map(|(k, v)| (k, v)));
    }
    cmd
}

#[tauri::command]
fn start_agent(
    app: AppHandle,
    agents: State<'_, Agents>,
    key: String,
    cwd: String,
    resume: Option<String>,
) -> Result<(), String> {
    if agents.0.lock().unwrap().contains_key(&key) {
        return Ok(());
    }
    let mut child = agent_command(&cwd, resume.as_deref()).spawn().map_err(|e| format!("falha ao iniciar omp: {e}"))?;
    let stdin = child.stdin.take().ok_or("stdin indisponível")?;
    let stdout = child.stdout.take().ok_or("stdout indisponível")?;
    let stderr = child.stderr.take().ok_or("stderr indisponível")?;

    let (app_out, key_out) = (app.clone(), key.clone());
    std::thread::spawn(move || {
        let mut reader = BufReader::with_capacity(1 << 20, stdout);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buf).trim_end().to_string();
                    if !line.is_empty() {
                        let _ = app_out.emit("omp-line", AgentLine { key: key_out.clone(), line });
                    }
                }
            }
        }
        let code = {
            let agents = app_out.state::<Agents>();
            let mut map = agents.0.lock().unwrap();
            map.remove(&key_out)
                .and_then(|mut a| a.child.wait().ok())
                .and_then(|s| s.code())
        };
        let _ = app_out.emit("omp-exit", AgentExit { key: key_out, code });
    });

    let (app_err, key_err) = (app.clone(), key.clone());
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = app_err.emit("omp-stderr", AgentLine { key: key_err.clone(), line });
        }
    });

    agents.0.lock().unwrap().insert(key, Agent { child, stdin });
    Ok(())
}

#[tauri::command]
fn send_agent(agents: State<'_, Agents>, key: String, line: String) -> Result<(), String> {
    let mut map = agents.0.lock().unwrap();
    let agent = map.get_mut(&key).ok_or("agente não está rodando")?;
    agent
        .stdin
        .write_all(line.as_bytes())
        .and_then(|_| agent.stdin.write_all(b"\n"))
        .and_then(|_| agent.stdin.flush())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn stop_agent(agents: State<'_, Agents>, key: String) {
    if let Some(mut a) = agents.0.lock().unwrap().remove(&key) {
        let _ = a.child.kill();
        let _ = a.child.wait();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    user: String,
    home: String,
    omp_path: String,
    omp_version: String,
    default_model: String,
}

/// Lê `modelRoles.default` do config do OMP (aceita YAML em bloco ou inline).
fn default_model() -> String {
    let Ok(cfg) = std::fs::read_to_string(home().join(".omp/agent/config.yml")) else {
        return String::new();
    };
    let Some(start) = cfg.find("modelRoles") else { return String::new() };
    let rest = &cfg[start..];
    let Some(pos) = rest.find("default:") else { return String::new() };
    rest[pos + "default:".len()..]
        .trim_start()
        .split(|c: char| c == ',' || c == '}' || c.is_whitespace())
        .next()
        .unwrap_or_default()
        .trim_matches(|c| c == '"' || c == '\'')
        .to_string()
}

#[tauri::command]
async fn app_info() -> AppInfo {
    let bin = omp_bin();
    let version = Command::new(&bin)
        .arg("--version")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    let user = Command::new("id")
        .arg("-F")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("USER").ok())
        .unwrap_or_default();
    AppInfo {
        user,
        home: home().to_string_lossy().into(),
        omp_path: bin.to_string_lossy().into(),
        omp_version: version,
        default_model: default_model(),
    }
}

#[tauri::command]
async fn list_sessions() -> Vec<sessions::SessionInfo> {
    sessions::list(&home().join(".omp/agent/sessions"))
}

#[tauri::command]
async fn read_session(path: String) -> Result<Vec<serde_json::Value>, String> {
    sessions::read_messages(&PathBuf::from(path))
}

pub fn run() {
    // Carrega o ambiente do shell em segundo plano para não atrasar a janela.
    std::thread::spawn(|| {
        login_env();
    });
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Agents::default())
        .invoke_handler(tauri::generate_handler![
            start_agent,
            send_agent,
            stop_agent,
            app_info,
            list_sessions,
            read_session
        ])
        .build(tauri::generate_context!())
        .expect("falha ao montar o app");
    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            let agents = handle.state::<Agents>();
            for (_, mut a) in agents.0.lock().unwrap().drain() {
                let _ = a.child.kill();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Precisa do `omp` instalado: `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn omp_rpc_responde_ready_e_get_state() {
        assert!(login_env().iter().any(|(k, _)| k == "PATH"), "PATH do shell de login");
        let dir = std::env::temp_dir();
        let mut child = agent_command(dir.to_str().unwrap(), None).arg("--no-session").spawn().unwrap();
        let mut stdin = child.stdin.take().unwrap();
        writeln!(stdin, r#"{{"id":"1","type":"get_state"}}"#).unwrap();
        let reader = BufReader::new(child.stdout.take().unwrap());
        let mut ready = false;
        let mut state = false;
        for line in reader.lines().map_while(Result::ok).take(200) {
            let v: serde_json::Value = serde_json::from_str(&line).unwrap_or_default();
            ready |= v["type"] == "ready";
            if v["type"] == "response" && v["id"] == "1" {
                assert_eq!(v["success"], true);
                assert!(v["data"]["sessionId"].is_string());
                state = true;
                break;
            }
        }
        let _ = child.kill();
        assert!(ready && state);
    }
}
