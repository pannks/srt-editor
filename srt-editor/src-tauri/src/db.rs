//! SQLite persistence: projects (media + SRT + per-project settings) and app settings.
//!
//! The schema is migrated forward by `PRAGMA user_version`: every entry in
//! `MIGRATIONS` is one version step and runs exactly once, in order.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Each entry moves `user_version` up by one. Append only — never edit a shipped entry.
const MIGRATIONS: &[&str] = &[
    // v1 — projects and app settings
    r#"
    CREATE TABLE projects (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        media_path  TEXT,
        media_kind  TEXT NOT NULL DEFAULT 'video',
        srt         TEXT NOT NULL DEFAULT '',
        settings    TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    "#,
    // v2 — per-cue translations, JSON keyed by language and aligned to the
    // cue order of `srt`, which keeps the SRT itself portable.
    r#"
    ALTER TABLE projects ADD COLUMN translations TEXT;
    "#,
];

pub struct Db(pub Mutex<Connection>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: i64,
    pub name: String,
    pub media_path: Option<String>,
    pub media_kind: String,
    /// Number of cues, derived from the stored SRT so the list needs no parsing.
    pub block_count: i64,
    pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub media_path: Option<String>,
    pub media_kind: String,
    pub srt: String,
    /// JSON array of `{lang: text}`, one entry per cue in `srt` order.
    pub translations: Option<String>,
    pub settings: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    /// `None` inserts a new project; `Some(id)` updates that row.
    pub id: Option<i64>,
    pub name: String,
    pub media_path: Option<String>,
    pub media_kind: String,
    pub srt: String,
    pub translations: Option<String>,
    pub settings: Option<String>,
}

fn err(e: impl std::fmt::Display) -> String {
    format!("database error: {e}")
}

/// Open the database in the app data dir and bring it up to the latest schema.
pub fn init(app: &AppHandle) -> Result<Db, String> {
    let dir = app.path().app_data_dir().map_err(err)?;
    std::fs::create_dir_all(&dir).map_err(err)?;
    let conn = Connection::open(dir.join("srt-studio.db")).map_err(err)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(err)?;
    migrate(&conn)?;
    Ok(Db(Mutex::new(conn)))
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let current: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(err)?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let version = i as i64 + 1;
        conn.execute_batch(&format!(
            "BEGIN; {sql} PRAGMA user_version = {version}; COMMIT;"
        ))
        .map_err(|e| err(format!("migration {version} failed: {e}")))?;
    }
    Ok(())
}

/// Schema version the database is currently at.
#[tauri::command]
pub fn db_version(db: tauri::State<'_, Db>) -> Result<i64, String> {
    let conn = db.0.lock().map_err(err)?;
    conn.query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(err)
}

#[tauri::command]
pub fn project_save(db: tauri::State<'_, Db>, project: ProjectInput) -> Result<i64, String> {
    let conn = db.0.lock().map_err(err)?;
    match project.id {
        Some(id) => {
            conn.execute(
                "UPDATE projects
                 SET name = ?1, media_path = ?2, media_kind = ?3, srt = ?4,
                     translations = ?5, settings = ?6, updated_at = datetime('now')
                 WHERE id = ?7",
                params![
                    project.name,
                    project.media_path,
                    project.media_kind,
                    project.srt,
                    project.translations,
                    project.settings,
                    id
                ],
            )
            .map_err(err)?;
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO projects (name, media_path, media_kind, srt, translations, settings)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    project.name,
                    project.media_path,
                    project.media_kind,
                    project.srt,
                    project.translations,
                    project.settings
                ],
            )
            .map_err(err)?;
            Ok(conn.last_insert_rowid())
        }
    }
}

#[tauri::command]
pub fn project_list(db: tauri::State<'_, Db>) -> Result<Vec<ProjectSummary>, String> {
    let conn = db.0.lock().map_err(err)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, media_path, media_kind, srt, updated_at
             FROM projects ORDER BY updated_at DESC",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([], |r| {
            let srt: String = r.get(4)?;
            Ok(ProjectSummary {
                id: r.get(0)?,
                name: r.get(1)?,
                media_path: r.get(2)?,
                media_kind: r.get(3)?,
                block_count: count_cues(&srt),
                updated_at: r.get(5)?,
            })
        })
        .map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

/// Cue count without parsing: every cue carries exactly one `-->` line.
fn count_cues(srt: &str) -> i64 {
    srt.lines().filter(|l| l.contains("-->")).count() as i64
}

#[tauri::command]
pub fn project_load(db: tauri::State<'_, Db>, id: i64) -> Result<Project, String> {
    let conn = db.0.lock().map_err(err)?;
    conn.query_row(
        "SELECT id, name, media_path, media_kind, srt, translations, settings,
                created_at, updated_at
         FROM projects WHERE id = ?1",
        params![id],
        |r| {
            Ok(Project {
                id: r.get(0)?,
                name: r.get(1)?,
                media_path: r.get(2)?,
                media_kind: r.get(3)?,
                srt: r.get(4)?,
                translations: r.get(5)?,
                settings: r.get(6)?,
                created_at: r.get(7)?,
                updated_at: r.get(8)?,
            })
        },
    )
    .map_err(|e| format!("project {id} not found: {e}"))
}

#[tauri::command]
pub fn project_delete(db: tauri::State<'_, Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn settings_get(db: tauri::State<'_, Db>, key: String) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(err)?;
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(err(other)),
    })
}

#[tauri::command]
pub fn settings_set(db: tauri::State<'_, Db>, key: String, value: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn migrated() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    fn user_version(conn: &Connection) -> i64 {
        conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn migrations_run_once_and_are_idempotent() {
        let conn = migrated();
        assert_eq!(user_version(&conn), MIGRATIONS.len() as i64);
        // A second pass must not re-run CREATE TABLE, which would error.
        migrate(&conn).unwrap();
        assert_eq!(user_version(&conn), MIGRATIONS.len() as i64);
    }

    #[test]
    fn projects_round_trip() {
        let conn = migrated();
        conn.execute(
            "INSERT INTO projects (name, media_path, media_kind, srt) VALUES (?1, ?2, ?3, ?4)",
            params!["demo", "/tmp/a.mp4", "video", "1\n00:00:00,000 --> 00:00:01,000\nhi\n"],
        )
        .unwrap();
        let (name, srt): (String, String) = conn
            .query_row("SELECT name, srt FROM projects", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(name, "demo");
        assert_eq!(count_cues(&srt), 1);
    }

    #[test]
    fn settings_upsert_replaces_the_value() {
        let conn = migrated();
        for value in ["first", "second"] {
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params!["k", value],
            )
            .unwrap();
        }
        let stored: String = conn
            .query_row("SELECT value FROM app_settings WHERE key = 'k'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(stored, "second");
    }

    #[test]
    fn v2_adds_the_translations_column() {
        let conn = migrated();
        conn.execute(
            "INSERT INTO projects (name, media_kind, srt, translations)
             VALUES (?1, ?2, ?3, ?4)",
            params!["demo", "video", "", r#"[{"th":"สวัสดี"}]"#],
        )
        .unwrap();
        let stored: Option<String> = conn
            .query_row("SELECT translations FROM projects", [], |r| r.get(0))
            .unwrap();
        assert_eq!(stored.as_deref(), Some(r#"[{"th":"สวัสดี"}]"#));
    }

    #[test]
    fn count_cues_counts_arrow_lines() {
        assert_eq!(count_cues(""), 0);
        assert_eq!(
            count_cues("1\n00:00:00,000 --> 00:00:01,000\na\n\n2\n00:00:01,000 --> 00:00:02,000\nb\n"),
            2
        );
    }
}
