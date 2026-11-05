use serde::Deserialize;
use tickmark_core::{Category, CategoryRepository, CreateCategory, Error, UpdateCategory};
use worker::{D1Database, wasm_bindgen::JsValue};

use crate::repository::{check, foreign_key_failure, storage};

pub struct D1CategoryRepository(pub D1Database);
const COLUMNS: &str = "CAST(id AS TEXT) AS id, name, color";

#[derive(Deserialize)]
struct Row {
    id: String,
    name: String,
    color: String,
}

impl TryFrom<Row> for Category {
    type Error = Error;
    fn try_from(row: Row) -> Result<Self, Error> {
        Ok(Self {
            id: row.id.parse().map_err(storage)?,
            name: row.name,
            color: row.color.parse().map_err(storage)?,
        })
    }
}

impl CategoryRepository for D1CategoryRepository {
    async fn create(&self, input: CreateCategory) -> Result<Category, Error> {
        self.0
            .prepare(format!(
                "INSERT INTO categories (name, color) VALUES (?1, ?2) RETURNING {COLUMNS}"
            ))
            .bind(&[input.name.into(), input.color.as_str().into()])
            .map_err(storage)?
            .first::<Row>(None)
            .await
            .map_err(storage)?
            .ok_or_else(|| storage("INSERT returned no row"))?
            .try_into()
    }

    async fn list(&self) -> Result<Vec<Category>, Error> {
        let result = self
            .0
            .prepare(format!(
                "SELECT {COLUMNS} FROM categories ORDER BY categories.id ASC"
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

    async fn update(&self, id: i64, input: UpdateCategory) -> Result<Option<Category>, Error> {
        self.0.prepare(format!("UPDATE categories SET name = COALESCE(?1, name), color = COALESCE(?2, color) WHERE id = ?3 RETURNING {COLUMNS}"))
            .bind(&[
                input.name.map(Into::into).unwrap_or(JsValue::NULL),
                input.color.map(|c| c.as_str().into()).unwrap_or(JsValue::NULL),
                id.to_string().into(),
            ]).map_err(storage)?
            .first::<Row>(None).await.map_err(storage)?.map(TryInto::try_into).transpose()
    }

    async fn delete(&self, id: i64) -> Result<bool, Error> {
        // The foreign key checks and deletion are atomic, including concurrent entry writes.
        let row = self
            .0
            .prepare("DELETE FROM categories WHERE id = ?1 RETURNING CAST(id AS TEXT) AS id")
            .bind(&[id.to_string().into()])
            .map_err(storage)?
            .first::<serde_json::Value>(None)
            .await
            .map_err(|error| {
                if foreign_key_failure(&error) {
                    Error::CategoryInUse
                } else {
                    storage(error)
                }
            })?;
        Ok(row.is_some())
    }
}
