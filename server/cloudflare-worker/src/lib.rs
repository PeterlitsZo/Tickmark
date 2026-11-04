mod repository;

use futures_util::StreamExt;
use repository::D1Repository;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tickmark_core::{EntryInput, EntryService, Error as CoreError, TimeEntry, TimeRange};
use worker::{Context, Env, Method, Request, Response, event};

const COLLECTION: &str = "/api/v1/entries";
const MAX_BODY_BYTES: usize = 16 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    title: String,
    start_time: i64,
    end_time: i64,
}

impl From<Input> for EntryInput {
    fn from(input: Input) -> Self {
        Self {
            title: input.title,
            start_time: input.start_time,
            end_time: input.end_time,
        }
    }
}

#[derive(Serialize)]
struct Entry {
    id: String,
    title: String,
    start_time: i64,
    end_time: i64,
}

impl From<TimeEntry> for Entry {
    fn from(entry: TimeEntry) -> Self {
        Self {
            id: entry.id.to_string(),
            title: entry.title,
            start_time: entry.start_time,
            end_time: entry.end_time,
        }
    }
}

struct ApiError {
    code: u16,
    status: &'static str,
    reason: &'static str,
    message: &'static str,
    field: Option<&'static str>,
    allow: Option<&'static str>,
}

impl ApiError {
    fn new(code: u16, status: &'static str, reason: &'static str, message: &'static str) -> Self {
        Self {
            code,
            status,
            reason,
            message,
            field: None,
            allow: None,
        }
    }

    fn field(field: &'static str, message: &'static str) -> Self {
        Self {
            field: Some(field),
            ..Self::new(400, "INVALID_ARGUMENT", "INVALID_FIELD", message)
        }
    }

    fn method(allow: &'static str) -> Self {
        Self {
            allow: Some(allow),
            ..Self::new(
                405,
                "UNIMPLEMENTED",
                "METHOD_NOT_ALLOWED",
                "Use a supported HTTP method.",
            )
        }
    }

    fn response(self) -> worker::Result<Response> {
        let mut details = vec![json!({
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            "reason": self.reason,
            "domain": "tickmark.peterlitszo",
            "metadata": {}
        })];
        if let Some(field) = self.field {
            details.push(json!({
                "@type": "type.googleapis.com/google.rpc.BadRequest",
                "fieldViolations": [{"field": field, "description": self.message}]
            }));
        }
        let mut response = Response::from_json(&json!({"error": {
            "code": self.code, "status": self.status, "message": self.message, "details": details
        }}))?
        .with_status(self.code);
        if let Some(allow) = self.allow {
            response.headers_mut().set("Allow", allow)?;
        }
        Ok(response)
    }
}

fn internal(error: impl std::fmt::Display) -> ApiError {
    worker::console_error!(
        "{}",
        json!({"event": "request_failed", "error": error.to_string()})
    );
    ApiError::new(
        500,
        "INTERNAL",
        "INTERNAL_ERROR",
        "The request could not be completed. Try again later.",
    )
}

impl From<CoreError> for ApiError {
    fn from(error: CoreError) -> Self {
        match error {
            CoreError::InvalidField { field, message } => Self::field(field, message),
            CoreError::InvalidTimeRange => Self::new(
                400,
                "INVALID_ARGUMENT",
                "INVALID_TIME_RANGE",
                "Entry end_time must be at least start_time; query from must be earlier than to.",
            ),
            CoreError::NotFound => Self::new(
                404,
                "NOT_FOUND",
                "ENTRY_NOT_FOUND",
                "The requested entry does not exist.",
            ),
            CoreError::Storage(message) => internal(message),
        }
    }
}

async fn input(req: &mut Request) -> Result<EntryInput, ApiError> {
    let content_type = req
        .headers()
        .get("Content-Type")
        .map_err(internal)?
        .unwrap_or_default();
    if !content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .eq_ignore_ascii_case("application/json")
    {
        return Err(ApiError::new(
            415,
            "INVALID_ARGUMENT",
            "UNSUPPORTED_MEDIA_TYPE",
            "Send the request as application/json.",
        ));
    }
    let mut stream = req
        .stream()
        .map_err(|_| ApiError::field("body", "Could not read the request body."))?;
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|_| ApiError::field("body", "Could not read the request body."))?;
        if bytes.len() + chunk.len() > MAX_BODY_BYTES {
            return Err(ApiError::field(
                "body",
                "JSON request bodies must not exceed 16384 bytes.",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice::<Input>(&bytes).map(Into::into).map_err(|error| {
        if error.is_data() {
            ApiError::field("body", "Provide only title as a string, and start_time and end_time as integers; all are required.")
        } else {
            ApiError::new(400, "INVALID_ARGUMENT", "INVALID_JSON", "Provide a valid JSON object.")
        }
    })
}

fn integer(value: &str, field: &'static str) -> Result<i64, ApiError> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ApiError::field(
            field,
            "Must be an unsigned decimal integer.",
        ));
    }
    value
        .parse()
        .map_err(|_| ApiError::field(field, "Integer is out of range."))
}

fn range(req: &Request) -> Result<TimeRange, ApiError> {
    let url = req.url().map_err(internal)?;
    let mut from = None;
    let mut to = None;
    for (key, value) in url.query_pairs() {
        let (slot, field) = match key.as_ref() {
            "from" => (&mut from, "from"),
            "to" => (&mut to, "to"),
            _ => {
                return Err(ApiError::field(
                    "query",
                    "Only from and to query parameters are supported.",
                ));
            }
        };
        if slot.is_some() {
            return Err(ApiError::field(
                field,
                "Provide this query parameter only once.",
            ));
        }
        *slot = Some(integer(&value, field)?);
    }
    Ok(TimeRange {
        from: from
            .ok_or_else(|| ApiError::field("from", "The from query parameter is required."))?,
        to: to.ok_or_else(|| ApiError::field("to", "The to query parameter is required."))?,
    })
}

async fn handle(mut req: Request, env: Env) -> Result<Response, ApiError> {
    let path = req.path();
    let method = req.method();
    let id = if path == COLLECTION {
        if !matches!(method, Method::Get | Method::Post) {
            return Err(ApiError::method("GET, POST"));
        }
        None
    } else if let Some(id) = path
        .strip_prefix("/api/v1/entries/")
        .filter(|id| !id.is_empty() && !id.contains('/'))
    {
        if !matches!(method, Method::Put | Method::Delete) {
            return Err(ApiError::method("PUT, DELETE"));
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
    let service = EntryService::new(D1Repository(env.d1("DB").map_err(internal)?));
    match (method, id) {
        (Method::Post, None) => {
            let entry = service.create(input(&mut req).await?).await?;
            Ok(Response::from_json(&Entry::from(entry))
                .map_err(internal)?
                .with_status(201))
        }
        (Method::Get, None) => {
            let items: Vec<Entry> = service
                .list(range(&req)?)
                .await?
                .into_iter()
                .map(Into::into)
                .collect();
            Response::from_json(&json!({"items": items})).map_err(internal)
        }
        (Method::Put, Some(id)) => {
            let entry = service.replace(id, input(&mut req).await?).await?;
            Response::from_json(&Entry::from(entry)).map_err(internal)
        }
        (Method::Delete, Some(id)) => {
            service.delete(id).await?;
            Ok(Response::empty().map_err(internal)?.with_status(204))
        }
        _ => unreachable!("Route and method were validated above"),
    }
}

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> worker::Result<Response> {
    match handle(req, env).await {
        Ok(response) => Ok(response),
        Err(error) => error.response(),
    }
}
