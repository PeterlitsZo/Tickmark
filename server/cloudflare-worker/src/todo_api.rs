use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::json;
use tickmark_core::{CreateTodo, DailyEffort, Error, Todo, TodoService, UpdateTodo};
use worker::{Date, Env, Method, Request, Response};

use crate::{
    ApiError, JsonBodyLimit, integer, internal, json_input_with_limit,
    todo_repository::D1TodoRepository,
};

pub(crate) const COLLECTION: &str = "/api/v1/todos";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateInput {
    title: String,
    #[serde(default)]
    description: String,
}

// Missing fields default to None; present null values must fail deserialization.
fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(d: D) -> Result<Option<T>, D::Error> {
    T::deserialize(d).map(Some)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EffortInput {
    date: String,
    minutes: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PatchInput {
    #[serde(default, deserialize_with = "present")]
    title: Option<String>,
    #[serde(default, deserialize_with = "present")]
    description: Option<String>,
    #[serde(default, deserialize_with = "present")]
    status: Option<String>,
    #[serde(default, deserialize_with = "present")]
    expected_daily_minutes: Option<Option<i64>>,
    #[serde(default, deserialize_with = "present")]
    daily_effort: Option<EffortInput>,
}

#[derive(Serialize)]
struct Output {
    id: String,
    title: String,
    description: String,
    status: &'static str,
    created_at: i64,
    updated_at: i64,
    expected_daily_minutes: Option<i64>,
    today_spent_minutes: i64,
    total_spent_minutes: i64,
}

#[derive(Serialize)]
struct DatedOutput {
    #[serde(flatten)]
    todo: Output,
    today: String,
    time_zone: String,
}

impl From<Todo> for Output {
    fn from(todo: Todo) -> Self {
        Self {
            id: todo.id.to_string(),
            title: todo.title,
            description: todo.description,
            status: todo.status.as_str(),
            created_at: todo.created_at,
            updated_at: todo.updated_at,
            expected_daily_minutes: todo.expected_daily_minutes,
            today_spent_minutes: todo.today_spent_minutes,
            total_spent_minutes: todo.total_spent_minutes,
        }
    }
}

fn filter(req: &Request) -> Result<Option<String>, ApiError> {
    let mut expression = None;
    for (key, value) in req.url().map_err(internal)?.query_pairs() {
        if key != "filter" {
            return Err(ApiError::field(
                "query",
                "Only the filter query parameter is supported.",
            ));
        }
        if expression.is_some() {
            return Err(ApiError::field(
                "filter",
                "Provide this query parameter only once.",
            ));
        }
        if value.len() > 5462 {
            return Err(
                Error::InvalidFilter("Encoded filter must not exceed 5462 characters.").into(),
            );
        }
        let bytes = URL_SAFE_NO_PAD
            .decode(value.as_bytes())
            .map_err(|_| Error::InvalidFilter("Use URL-safe Base64 without padding."))?;
        if bytes.len() > 4096 {
            return Err(Error::InvalidFilter("Decoded filter must not exceed 4096 bytes.").into());
        }
        expression = Some(
            String::from_utf8(bytes)
                .map_err(|_| Error::InvalidFilter("Decoded filter must be valid UTF-8."))?,
        );
    }
    Ok(expression)
}

pub(crate) async fn handle(mut req: Request, env: Env) -> Result<Response, ApiError> {
    let path = req.path();
    let method = req.method();
    let id = if path == COLLECTION {
        if !matches!(method, Method::Get | Method::Post) {
            return Err(ApiError::method("GET, POST"));
        }
        None
    } else if let Some(id) = path
        .strip_prefix("/api/v1/todos/")
        .filter(|id| !id.is_empty() && !id.contains('/'))
    {
        if !matches!(method, Method::Patch | Method::Delete) {
            return Err(ApiError::method("PATCH, DELETE"));
        }
        Some(integer(id, "id")?)
    } else {
        return Err(ApiError::new(
            404,
            "NOT_FOUND",
            "ROUTE_NOT_FOUND",
            "The requested route does not exist.",
        ));
    };
    let timestamp = now();
    let (today, time_zone) = day_context(&env, timestamp)?;
    let service = TodoService::new(D1TodoRepository(
        env.d1("DB").map_err(internal)?,
        today.clone(),
    ));
    match (method, id) {
        (Method::Post, None) => {
            let input: CreateInput =
                json_input_with_limit(&mut req, "Provide title as a string and optionally description as a string; null and unknown fields are not allowed.", JsonBodyLimit::Description).await?;
            let todo = service
                .create(
                    CreateTodo {
                        title: input.title,
                        description: input.description,
                    },
                    timestamp,
                )
                .await?;
            Ok(Response::from_json(&DatedOutput {
                todo: todo.into(),
                today,
                time_zone,
            })
            .map_err(internal)?
            .with_status(201))
        }
        (Method::Get, None) => {
            let expression = filter(&req)?;
            let items: Vec<Output> = service
                .list(expression.as_deref())
                .await?
                .into_iter()
                .map(Into::into)
                .collect();
            Response::from_json(&json!({"items": items, "today": today, "time_zone": time_zone}))
                .map_err(internal)
        }
        (Method::Patch, Some(id)) => {
            let input: PatchInput = json_input_with_limit(
                &mut req,
                "Provide editable todo fields with valid types. Only expected_daily_minutes accepts null; daily_effort requires date and integer minutes. Unknown fields are not allowed.",
                JsonBodyLimit::Description,
            )
            .await?;
            let todo = service
                .update(
                    id,
                    UpdateTodo {
                        title: input.title,
                        description: input.description,
                        status: input.status.map(|s| s.parse()).transpose()?,
                        expected_daily_minutes: input.expected_daily_minutes,
                        daily_effort: input.daily_effort.map(|e| DailyEffort {
                            date: e.date,
                            minutes: e.minutes,
                        }),
                    },
                    timestamp,
                )
                .await?;
            Response::from_json(&DatedOutput {
                todo: todo.into(),
                today,
                time_zone,
            })
            .map_err(internal)
        }
        (Method::Delete, Some(id)) => {
            service.delete(id).await?;
            Ok(Response::empty().map_err(internal)?.with_status(204))
        }
        _ => unreachable!("Route and method were validated above"),
    }
}

fn now() -> i64 {
    (Date::now().as_millis() / 1000) as i64
}

// Resolve the request's day once, never from a client device or a query parameter.
pub(crate) fn day_context(env: &Env, timestamp: i64) -> Result<(String, String), ApiError> {
    let name = env.var("APP_TIME_ZONE").map_err(internal)?.to_string();
    let zone: chrono_tz::Tz = name.parse().map_err(internal)?;
    let instant = chrono::DateTime::from_timestamp(timestamp, 0)
        .ok_or_else(|| internal("Invalid current timestamp"))?;
    Ok((
        instant.with_timezone(&zone).format("%Y-%m-%d").to_string(),
        name,
    ))
}
