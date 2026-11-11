use crate::{
    Error, todo_filter::TodoFilter, validate_description, validate_id, validate_timestamp,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TodoStatus {
    Open,
    Completed,
}

impl TodoStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Open => "OPEN",
            Self::Completed => "COMPLETED",
        }
    }
}

impl std::str::FromStr for TodoStatus {
    type Err = Error;

    fn from_str(value: &str) -> Result<Self, Error> {
        match value {
            "OPEN" => Ok(Self::Open),
            "COMPLETED" => Ok(Self::Completed),
            _ => Err(Error::InvalidField {
                field: "status",
                message: "Must be OPEN or COMPLETED.",
            }),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Todo {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub status: TodoStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub expected_daily_minutes: Option<i64>,
    pub today_spent_minutes: i64,
    pub total_spent_minutes: i64,
}

pub struct CreateTodo {
    pub title: String,
    pub description: String,
}

pub struct DailyEffort {
    pub date: String,
    pub minutes: i64,
}

pub struct UpdateTodo {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TodoStatus>,
    pub expected_daily_minutes: Option<Option<i64>>,
    pub daily_effort: Option<DailyEffort>,
}

fn validate_title(title: &str) -> Result<(), Error> {
    if !(1..=500).contains(&title.chars().count()) {
        return Err(Error::InvalidField {
            field: "title",
            message: "Must contain 1 to 500 Unicode scalar values.",
        });
    }
    Ok(())
}

#[allow(async_fn_in_trait)]
pub trait TodoRepository {
    async fn create(&self, input: CreateTodo, now: i64) -> Result<Todo, Error>;
    async fn list(&self) -> Result<Vec<Todo>, Error>;
    async fn update(&self, id: i64, input: UpdateTodo, now: i64) -> Result<Option<Todo>, Error>;
    async fn delete(&self, id: i64) -> Result<bool, Error>;
}

pub struct TodoService<R> {
    repository: R,
}

impl<R: TodoRepository> TodoService<R> {
    pub fn new(repository: R) -> Self {
        Self { repository }
    }

    pub async fn create(&self, input: CreateTodo, now: i64) -> Result<Todo, Error> {
        validate_title(&input.title)?;
        validate_description(&input.description)?;
        validate_timestamp(now, "created_at")?;
        self.repository.create(input, now).await
    }

    pub async fn list(&self, expression: Option<&str>) -> Result<Vec<Todo>, Error> {
        // Validate before storage access, including when the table is empty.
        let filter = expression.map(TodoFilter::parse).transpose()?;
        let items = self.repository.list().await?;
        match filter {
            Some(filter) => filter.apply(items).await,
            None => Ok(items),
        }
    }

    pub async fn update(&self, id: i64, input: UpdateTodo, now: i64) -> Result<Todo, Error> {
        validate_id(id)?;
        validate_timestamp(now, "updated_at")?;
        if let Some(title) = &input.title {
            validate_title(title)?;
        }
        if let Some(description) = &input.description {
            validate_description(description)?;
        }
        if let Some(Some(minutes)) = input.expected_daily_minutes
            && !(1..=1440).contains(&minutes)
        {
            return Err(Error::InvalidField {
                field: "expected_daily_minutes",
                message: "Use 1 to 1440 minutes, or null.",
            });
        }
        if let Some(effort) = &input.daily_effort {
            let valid_date = effort.date.len() == 10
                && chrono::NaiveDate::parse_from_str(&effort.date, "%Y-%m-%d").is_ok_and(|date| {
                    date.format("%Y-%m-%d").to_string() == effort.date
                        && effort.date.as_str() >= "0001-01-01"
                });
            if !valid_date {
                return Err(Error::InvalidField {
                    field: "daily_effort.date",
                    message: "Use a valid YYYY-MM-DD date from 0001-01-01 to 9999-12-31.",
                });
            }
            if !(0..=1440).contains(&effort.minutes) {
                return Err(Error::InvalidField {
                    field: "daily_effort.minutes",
                    message: "Use 0 to 1440 minutes.",
                });
            }
        }
        if input.title.is_none()
            && input.status.is_none()
            && input.description.is_none()
            && input.expected_daily_minutes.is_none()
            && input.daily_effort.is_none()
        {
            return Err(Error::InvalidField {
                field: "body",
                message: "Provide at least one editable todo field.",
            });
        }
        self.repository
            .update(id, input, now)
            .await?
            .ok_or(Error::TodoNotFound)
    }

    pub async fn delete(&self, id: i64) -> Result<(), Error> {
        validate_id(id)?;
        if self.repository.delete(id).await? {
            Ok(())
        } else {
            Err(Error::TodoNotFound)
        }
    }
}
