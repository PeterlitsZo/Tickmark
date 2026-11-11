use crate::{
    ApiError, integer, internal, json_input, todo_filter_repository::D1TodoFilterRepository,
    todo_repository::D1TodoRepository,
};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::json;
use tickmark_core::{CreateTodoFilter, SavedTodoFilter, TodoFilterService, UpdateTodoFilter};
use worker::{Date, Env, Method, Request, Response};

pub(crate) const COLLECTION: &str = "/api/v1/todo-filters";
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateInput {
    name: String,
    filter_expr: String,
}
fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(d: D) -> Result<Option<T>, D::Error> {
    T::deserialize(d).map(Some)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PatchInput {
    #[serde(default, deserialize_with = "present")]
    name: Option<String>,
    #[serde(default, deserialize_with = "present")]
    filter_expr: Option<String>,
}
#[derive(Serialize)]
struct Output {
    id: String,
    name: String,
    filter_expr: String,
    position: i64,
    created_at: i64,
    updated_at: i64,
}
impl From<SavedTodoFilter> for Output {
    fn from(value: SavedTodoFilter) -> Self {
        Self {
            id: value.id.to_string(),
            name: value.name,
            filter_expr: value.filter_expr,
            position: value.position,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

pub(crate) async fn handle(mut req: Request, env: Env) -> Result<Response, ApiError> {
    if req.url().map_err(internal)?.query_pairs().next().is_some() {
        return Err(ApiError::field(
            "query",
            "This endpoint does not accept query parameters.",
        ));
    }
    let path = req.path();
    let method = req.method();
    let id = if path == COLLECTION {
        if !matches!(method, Method::Get | Method::Post) {
            return Err(ApiError::method("GET, POST"));
        }
        None
    } else if let Some(id) = path
        .strip_prefix("/api/v1/todo-filters/")
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
    let now = (Date::now().as_millis() / 1000) as i64;
    let service = TodoFilterService::new(
        D1TodoFilterRepository(env.d1("DB").map_err(internal)?),
        D1TodoRepository(
            env.d1("DB").map_err(internal)?,
            crate::todo_api::day_context(&env, now)?.0,
        ),
    );
    match (method, id) {
        (Method::Get, None) => {
            let items: Vec<Output> = service.list().await?.into_iter().map(Into::into).collect();
            Response::from_json(&json!({"items": items})).map_err(internal)
        }
        (Method::Post, None) => {
            let input: CreateInput = json_input(
                &mut req,
                "Provide name and filter_expr as strings; null and unknown fields are not allowed.",
            )
            .await?;
            let saved = service
                .create(
                    CreateTodoFilter {
                        name: input.name,
                        filter_expr: input.filter_expr,
                    },
                    now,
                )
                .await
                .map_err(config_error)?;
            Ok(Response::from_json(&Output::from(saved))
                .map_err(internal)?
                .with_status(201))
        }
        (Method::Patch, Some(id)) => {
            let input: PatchInput = json_input(&mut req, "Provide name and/or filter_expr as strings; null and unknown fields are not allowed.").await?;
            let saved = service
                .update(
                    id,
                    UpdateTodoFilter {
                        name: input.name,
                        filter_expr: input.filter_expr,
                    },
                    now,
                )
                .await
                .map_err(config_error)?;
            Response::from_json(&Output::from(saved)).map_err(internal)
        }
        (Method::Delete, Some(id)) => {
            service.delete(id).await?;
            Ok(Response::empty().map_err(internal)?.with_status(204))
        }
        _ => unreachable!(),
    }
}

fn config_error(error: tickmark_core::Error) -> ApiError {
    let mut error: ApiError = error.into();
    if error.field == Some("filter") {
        error.field = Some("filter_expr");
    }
    error
}
