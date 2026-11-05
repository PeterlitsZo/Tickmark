use serde::{Deserialize, Serialize};
use serde_json::json;
use tickmark_core::{Category, CategoryService, CreateCategory, UpdateCategory};
use worker::{Env, Method, Request, Response};

use crate::{
    ApiError, category_repository::D1CategoryRepository, integer, internal, json_input, present,
};

pub(crate) const COLLECTION: &str = "/api/v1/categories";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateInput {
    name: String,
    color: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PatchInput {
    #[serde(default, deserialize_with = "present")]
    name: Option<String>,
    #[serde(default, deserialize_with = "present")]
    color: Option<String>,
}

#[derive(Serialize)]
struct Output {
    id: String,
    name: String,
    color: &'static str,
}

impl From<Category> for Output {
    fn from(category: Category) -> Self {
        Self {
            id: category.id.to_string(),
            name: category.name,
            color: category.color.as_str(),
        }
    }
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
        .strip_prefix("/api/v1/categories/")
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
    let service = CategoryService::new(D1CategoryRepository(env.d1("DB").map_err(internal)?));
    match (method, id) {
        (Method::Post, None) => {
            let input: CreateInput = json_input(
                &mut req,
                "Provide only name and color as strings; both are required.",
            )
            .await?;
            let category = service
                .create(CreateCategory {
                    name: input.name,
                    color: input.color.parse()?,
                })
                .await?;
            Ok(Response::from_json(&Output::from(category))
                .map_err(internal)?
                .with_status(201))
        }
        (Method::Get, None) => {
            if req.url().map_err(internal)?.query().is_some() {
                return Err(ApiError::field(
                    "query",
                    "Query parameters are not supported.",
                ));
            }
            let items: Vec<Output> = service.list().await?.into_iter().map(Into::into).collect();
            Response::from_json(&json!({"items": items})).map_err(internal)
        }
        (Method::Patch, Some(id)) => {
            let input: PatchInput = json_input(
                &mut req,
                "Provide name and/or color as strings; null and unknown fields are not allowed.",
            )
            .await?;
            let category = service
                .update(
                    id,
                    UpdateCategory {
                        name: input.name,
                        color: input.color.map(|c| c.parse()).transpose()?,
                    },
                )
                .await?;
            Response::from_json(&Output::from(category)).map_err(internal)
        }
        (Method::Delete, Some(id)) => {
            service.delete(id).await?;
            Ok(Response::empty().map_err(internal)?.with_status(204))
        }
        _ => unreachable!("Route and method were validated above"),
    }
}
