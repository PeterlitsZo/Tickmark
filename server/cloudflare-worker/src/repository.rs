use indoc::formatdoc;
use serde::Deserialize;
use tickmark_core::{EntryInput, Error, TimeEntry, TimeEntryRepository, TimeRange};
use worker::{D1Database, D1Result};

pub struct D1Repository(pub D1Database);

// Cast IDs in SQL before crossing the JavaScript boundary.
const COLUMNS: &str =
    "CAST(id AS TEXT) AS id, title, start_time, end_time, CAST(category_id AS TEXT) AS category_id";

#[derive(Deserialize)]
struct Row {
    category_id: String,
    id: String,
    title: String,
    start_time: i64,
    end_time: i64,
}

impl TryFrom<Row> for TimeEntry {
    type Error = Error;
    fn try_from(row: Row) -> Result<Self, Error> {
        Ok(Self {
            category_id: row.category_id.parse().map_err(storage)?,
            id: row.id.parse().map_err(storage)?,
            title: row.title,
            start_time: row.start_time,
            end_time: row.end_time,
        })
    }
}

pub(crate) fn storage(error: impl std::fmt::Display) -> Error {
    Error::Storage(error.to_string())
}

pub(crate) fn check(result: D1Result) -> Result<D1Result, Error> {
    if !result.success() {
        return Err(storage(
            result.error().unwrap_or_else(|| "D1 query failed".into()),
        ));
    }
    Ok(result)
}

impl TimeEntryRepository for D1Repository {
    async fn create(&self, input: EntryInput) -> Result<TimeEntry, Error> {
        let category = input
            .category_id
            .map(|id| id.to_string().into())
            .unwrap_or(worker::wasm_bindgen::JsValue::NULL);
        // A D1 batch is one transaction: concurrent legacy creates share one default.
        let statements = vec![
            self.0.prepare("INSERT INTO categories (name, color) SELECT 'Default', 'GRAY' WHERE ?1 IS NULL AND NOT EXISTS (SELECT 1 FROM categories)")
                .bind(std::slice::from_ref(&category)).map_err(storage)?,
            self.0.prepare(formatdoc! { r#"
                INSERT INTO time_entries (title, start_time, end_time, category_id)
                VALUES (?1, ?2, ?3, COALESCE(?4, (SELECT MIN(id) FROM categories)))
                RETURNING {COLUMNS}
            "# }).bind(&[
                input.title.into(), (input.start_time as f64).into(),
                (input.end_time as f64).into(), category,
            ]).map_err(storage)?,
        ];
        let mut results = self
            .0
            .batch(statements)
            .await
            .map_err(category_reference_error)?;
        let result = results
            .pop()
            .ok_or_else(|| storage("INSERT returned no result"))?;
        check(result)?
            .results::<Row>()
            .map_err(storage)?
            .into_iter()
            .next()
            .ok_or_else(|| storage("INSERT returned no row"))?
            .try_into()
    }

    async fn list(&self, range: TimeRange) -> Result<Vec<TimeEntry>, Error> {
        let result = self
            .0
            .prepare(formatdoc! { r#"
                SELECT {COLUMNS} FROM time_entries
                WHERE (start_time < ?2 AND end_time > ?1)
                   OR (start_time = end_time AND start_time >= ?1 AND start_time < ?2)
                ORDER BY start_time ASC, time_entries.id ASC
            "# })
            .bind(&[(range.from as f64).into(), (range.to as f64).into()])
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

    async fn replace(&self, id: i64, input: EntryInput) -> Result<Option<TimeEntry>, Error> {
        self.0
            .prepare(formatdoc! { r#"
                UPDATE time_entries
                SET title = ?1, start_time = ?2, end_time = ?3,
                    category_id = COALESCE(?5, category_id)
                WHERE id = ?4
                RETURNING {COLUMNS}
            "# })
            .bind(&[
                input.title.into(),
                (input.start_time as f64).into(),
                (input.end_time as f64).into(),
                id.to_string().into(),
                input
                    .category_id
                    .map(|id| id.to_string().into())
                    .unwrap_or(worker::wasm_bindgen::JsValue::NULL),
            ])
            .map_err(storage)?
            .first::<Row>(None)
            .await
            .map_err(category_reference_error)?
            .map(TryInto::try_into)
            .transpose()
    }

    async fn delete(&self, id: i64) -> Result<bool, Error> {
        let result = self
            .0
            .prepare("DELETE FROM time_entries WHERE id = ?1")
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

// Only the category foreign key can fail in these entry writes.
fn category_reference_error(error: worker::Error) -> Error {
    if foreign_key_failure(&error) {
        Error::CategoryNotFound
    } else {
        storage(error)
    }
}

pub(crate) fn foreign_key_failure(error: &worker::Error) -> bool {
    matches!(error, worker::Error::D1(error) if error.cause().contains("FOREIGN KEY constraint failed"))
}
