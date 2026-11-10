use crate::repository::{check, storage};
use serde::Deserialize;
use tickmark_core::{
    CreateTodoFilter, Error, SavedTodoFilter, TodoFilterRepository, UpdateTodoFilter,
};
use worker::{D1Database, wasm_bindgen::JsValue};

pub struct D1TodoFilterRepository(pub D1Database);
const COLUMNS: &str = "CAST(id AS TEXT) AS id, name, filter_expr, position, created_at, updated_at";

#[derive(Deserialize)]
struct Row {
    id: String,
    name: String,
    filter_expr: String,
    position: i64,
    created_at: i64,
    updated_at: i64,
}
impl TryFrom<Row> for SavedTodoFilter {
    type Error = Error;
    fn try_from(row: Row) -> Result<Self, Error> {
        Ok(Self {
            id: row.id.parse().map_err(storage)?,
            name: row.name,
            filter_expr: row.filter_expr,
            position: row.position,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

impl TodoFilterRepository for D1TodoFilterRepository {
    async fn list(&self) -> Result<Vec<SavedTodoFilter>, Error> {
        let result = self
            .0
            .prepare(format!(
                "SELECT {COLUMNS} FROM todo_filters ORDER BY position, todo_filters.id"
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
    async fn create(&self, input: CreateTodoFilter, now: i64) -> Result<SavedTodoFilter, Error> {
        // Allocate the position in the same statement as the insert.
        self.0.prepare(format!("INSERT INTO todo_filters (name, filter_expr, position, created_at, updated_at) SELECT ?1, ?2, COALESCE(MAX(position), -1) + 1, ?3, ?3 FROM todo_filters RETURNING {COLUMNS}"))
            .bind(&[input.name.into(), input.filter_expr.into(), (now as f64).into()]).map_err(storage)?
            .first::<Row>(None).await.map_err(storage)?.ok_or_else(|| storage("INSERT returned no row"))?.try_into()
    }
    async fn update(
        &self,
        id: i64,
        input: UpdateTodoFilter,
        now: i64,
    ) -> Result<Option<SavedTodoFilter>, Error> {
        self.0.prepare(format!("UPDATE todo_filters SET name = COALESCE(?1, name), filter_expr = COALESCE(?2, filter_expr), updated_at = CASE WHEN (?1 IS NOT NULL AND ?1 != name) OR (?2 IS NOT NULL AND ?2 != filter_expr) THEN ?3 ELSE updated_at END WHERE id = ?4 RETURNING {COLUMNS}"))
            .bind(&[input.name.map(Into::into).unwrap_or(JsValue::NULL), input.filter_expr.map(Into::into).unwrap_or(JsValue::NULL), (now as f64).into(), id.to_string().into()]).map_err(storage)?
            .first::<Row>(None).await.map_err(storage)?.map(TryInto::try_into).transpose()
    }
    async fn delete(&self, id: i64) -> Result<bool, Error> {
        let result = self
            .0
            .prepare("DELETE FROM todo_filters WHERE id = ?1")
            .bind(&[id.to_string().into()])
            .map_err(storage)?
            .run()
            .await
            .map_err(storage)?;
        Ok(check(result)?
            .meta()
            .map_err(storage)?
            .and_then(|meta| meta.changes)
            .ok_or_else(|| storage("DELETE returned no change count"))?
            > 0)
    }
}
