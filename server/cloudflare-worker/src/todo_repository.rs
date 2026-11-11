use indoc::formatdoc;
use serde::Deserialize;
use tickmark_core::{CreateTodo, Error, Todo, TodoRepository, UpdateTodo};
use worker::D1Database;

use crate::repository::{check, storage};

pub struct D1TodoRepository(pub D1Database, pub String);

const COLUMNS: &str = "CAST(id AS TEXT) AS id, title, description, status, created_at, updated_at, expected_daily_minutes";

const SUMMARY: &str = "SELECT CAST(todos.id AS TEXT) AS id, todos.title, todos.description, todos.status, todos.created_at, todos.updated_at, todos.expected_daily_minutes, COALESCE(e.today_spent_minutes, 0) AS today_spent_minutes, COALESCE(e.total_spent_minutes, 0) AS total_spent_minutes FROM todos LEFT JOIN (SELECT todo_id, SUM(CASE WHEN local_date = ?1 THEN minutes ELSE 0 END) AS today_spent_minutes, SUM(minutes) AS total_spent_minutes FROM todo_daily_effort GROUP BY todo_id) e ON e.todo_id = todos.id";

#[derive(Deserialize)]
struct Row {
    id: String,
    title: String,
    description: String,
    status: String,
    created_at: i64,
    updated_at: i64,
    expected_daily_minutes: Option<i64>,
    today_spent_minutes: i64,
    total_spent_minutes: i64,
}

impl TryFrom<Row> for Todo {
    type Error = Error;

    fn try_from(row: Row) -> Result<Self, Error> {
        Ok(Self {
            id: row.id.parse().map_err(storage)?,
            title: row.title,
            description: row.description,
            status: row.status.parse().map_err(storage)?,
            created_at: row.created_at,
            updated_at: row.updated_at,
            expected_daily_minutes: row.expected_daily_minutes,
            today_spent_minutes: row.today_spent_minutes,
            total_spent_minutes: row.total_spent_minutes,
        })
    }
}

impl TodoRepository for D1TodoRepository {
    async fn create(&self, input: CreateTodo, now: i64) -> Result<Todo, Error> {
        self.0
            .prepare(formatdoc! { r#"
            INSERT INTO todos (title, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)
            RETURNING {COLUMNS}, 0 AS today_spent_minutes, 0 AS total_spent_minutes
        "# })
            .bind(&[
                input.title.into(),
                input.description.into(),
                (now as f64).into(),
            ])
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
            .prepare(format!("{SUMMARY} ORDER BY todos.id DESC"))
            .bind(&[self.1.clone().into()])
            .map_err(storage)?
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
        // Compare against the old daily value before its UPSERT. All three statements
        // share a D1 batch transaction, including the returned aggregate snapshot.
        let null = worker::wasm_bindgen::JsValue::NULL;
        let update = self.0.prepare(r#"
            UPDATE todos SET title = COALESCE(?1, title),
                status = COALESCE(?2, status), description = COALESCE(?3, description),
                expected_daily_minutes = CASE WHEN ?6 THEN ?7 ELSE expected_daily_minutes END,
                updated_at = CASE WHEN (?1 IS NOT NULL AND ?1 != title)
                    OR (?2 IS NOT NULL AND ?2 != status)
                    OR (?3 IS NOT NULL AND ?3 != description)
                    OR (?6 AND ?7 IS NOT expected_daily_minutes)
                    OR (?8 IS NOT NULL AND ?9 != COALESCE((SELECT minutes FROM todo_daily_effort WHERE todo_id = todos.id AND local_date = ?8), 0))
                    THEN ?4 ELSE updated_at END
            WHERE id = ?5
        "#).bind(&[
            input.title.map(Into::into).unwrap_or(null.clone()),
            input.status.map(|s| s.as_str().into()).unwrap_or(null.clone()),
            input.description.map(Into::into).unwrap_or(null.clone()),
            (now as f64).into(), id.to_string().into(),
            (if input.expected_daily_minutes.is_some() { 1 } else { 0 }).into(),
            input.expected_daily_minutes.flatten().map(|m| (m as f64).into()).unwrap_or(null.clone()),
            input.daily_effort.as_ref().map(|e| e.date.clone().into()).unwrap_or(null.clone()),
            input.daily_effort.as_ref().map(|e| (e.minutes as f64).into()).unwrap_or(null),
        ]).map_err(storage)?;
        let mut statements = vec![update];
        if let Some(effort) = input.daily_effort {
            statements.push(
                self.0
                    .prepare(
                        r#"
                INSERT INTO todo_daily_effort (todo_id, local_date, minutes)
                SELECT id, ?2, ?3 FROM todos WHERE id = ?1
                ON CONFLICT(todo_id, local_date) DO UPDATE SET minutes = excluded.minutes
            "#,
                    )
                    .bind(&[
                        id.to_string().into(),
                        effort.date.into(),
                        (effort.minutes as f64).into(),
                    ])
                    .map_err(storage)?,
            );
        }
        statements.push(
            self.0
                .prepare(format!("{SUMMARY} WHERE todos.id = ?2"))
                .bind(&[self.1.clone().into(), id.to_string().into()])
                .map_err(storage)?,
        );
        let mut results = self.0.batch(statements).await.map_err(storage)?;
        let result = results
            .pop()
            .ok_or_else(|| storage("Batch returned no results"))?;
        for result in results {
            check(result)?;
        }
        check(result)?
            .results::<Row>()
            .map_err(storage)?
            .into_iter()
            .next()
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
