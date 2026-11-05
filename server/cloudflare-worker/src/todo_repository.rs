use indoc::formatdoc;
use serde::Deserialize;
use tickmark_core::{CreateTodo, Error, Todo, TodoRepository, UpdateTodo};
use worker::D1Database;

use crate::repository::{check, storage};

pub struct D1TodoRepository(pub D1Database);

const COLUMNS: &str = "CAST(id AS TEXT) AS id, title, status, created_at, updated_at";

#[derive(Deserialize)]
struct Row {
    id: String,
    title: String,
    status: String,
    created_at: i64,
    updated_at: i64,
}

impl TryFrom<Row> for Todo {
    type Error = Error;

    fn try_from(row: Row) -> Result<Self, Error> {
        Ok(Self {
            id: row.id.parse().map_err(storage)?,
            title: row.title,
            status: row.status.parse().map_err(storage)?,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

impl TodoRepository for D1TodoRepository {
    async fn create(&self, input: CreateTodo, now: i64) -> Result<Todo, Error> {
        self.0
            .prepare(formatdoc! { r#"
            INSERT INTO todos (title, created_at, updated_at) VALUES (?1, ?2, ?2)
            RETURNING {COLUMNS}
        "# })
            .bind(&[input.title.into(), (now as f64).into()])
            .map_err(storage)?
            .first::<Row>(None)
            .await
            .map_err(storage)?
            .ok_or_else(|| storage("INSERT returned no row"))?
            .try_into()
    }

    async fn list(&self) -> Result<Vec<Todo>, Error> {
        let result = self
            .0
            .prepare(format!(
                "SELECT {COLUMNS} FROM todos ORDER BY todos.id DESC"
            ))
            .all()
            .await
            .map_err(storage)?;
        check(result)?
            .results::<Row>()
            .map_err(storage)?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
    }

    async fn update(&self, id: i64, input: UpdateTodo, now: i64) -> Result<Option<Todo>, Error> {
        // Null bindings mean omitted fields. HTTP rejects explicit null inputs.
        // All RHS expressions see the original row, so comparison and updates are atomic.
        self.0
            .prepare(formatdoc! { r#"
            UPDATE todos
            SET title = COALESCE(?1, title),
                status = COALESCE(?2, status),
                updated_at = CASE
                    WHEN (?1 IS NOT NULL AND ?1 != title)
                      OR (?2 IS NOT NULL AND ?2 != status) THEN ?3
                    ELSE updated_at END
            WHERE id = ?4
            RETURNING {COLUMNS}
        "# })
            .bind(&[
                input
                    .title
                    .map(Into::into)
                    .unwrap_or(worker::wasm_bindgen::JsValue::NULL),
                input
                    .status
                    .map(|s| s.as_str().into())
                    .unwrap_or(worker::wasm_bindgen::JsValue::NULL),
                (now as f64).into(),
                id.to_string().into(),
            ])
            .map_err(storage)?
            .first::<Row>(None)
            .await
            .map_err(storage)?
            .map(TryInto::try_into)
            .transpose()
    }

    async fn delete(&self, id: i64) -> Result<bool, Error> {
        let result = self
            .0
            .prepare("DELETE FROM todos WHERE id = ?1")
            .bind(&[id.to_string().into()])
            .map_err(storage)?
            .run()
            .await
            .map_err(storage)?;
        let changes = check(result)?
            .meta()
            .map_err(storage)?
            .and_then(|meta| meta.changes)
            .ok_or_else(|| storage("DELETE returned no change count"))?;
        Ok(changes > 0)
    }
}
