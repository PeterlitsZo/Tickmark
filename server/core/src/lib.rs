//! Platform-independent time-entry and todo rules and persistence boundaries.
mod category;
mod todo;
pub use category::{
    Category, CategoryColor, CategoryRepository, CategoryService, CreateCategory, UpdateCategory,
};
mod saved_todo_filter;
mod todo_filter;
pub use saved_todo_filter::{
    CreateTodoFilter, SavedTodoFilter, TodoFilterRepository, TodoFilterService, UpdateTodoFilter,
};

use std::fmt;
pub use todo::{
    CreateTodo, DailyEffort, Todo, TodoRepository, TodoService, TodoStatus, UpdateTodo,
};

pub const MAX_TIMESTAMP: i64 = 9_007_199_254_740_991;

#[derive(Debug, Clone)]
pub struct TimeEntry {
    pub category_id: i64,
    pub id: i64,
    pub title: String,
    pub description: String,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug)]
pub struct EntryInput {
    pub category_id: Option<i64>,
    pub title: String,
    pub description: Option<String>,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug, Clone, Copy)]
pub struct TimeRange {
    pub from: i64,
    pub to: i64,
}

#[derive(Debug)]
pub enum Error {
    InvalidField {
        field: &'static str,
        message: &'static str,
    },
    InvalidTimeRange,
    NotFound,
    TodoNotFound,
    TodoFilterNotFound,
    CategoryNotFound,
    CategoryInUse,
    InvalidFilter(&'static str),
    Storage(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidField { field, message } => write!(f, "{field}: {message}"),
            Self::InvalidTimeRange => f.write_str("Invalid time range"),
            Self::NotFound => f.write_str("Entry not found"),
            Self::CategoryNotFound => f.write_str("Category not found"),
            Self::CategoryInUse => f.write_str("Category is in use"),
            Self::TodoFilterNotFound => f.write_str("Todo filter not found"),
            Self::TodoNotFound => f.write_str("Todo not found"),
            Self::InvalidFilter(message) => write!(f, "Invalid filter: {message}"),
            Self::Storage(message) => write!(f, "Storage failure: {message}"),
        }
    }
}

impl std::error::Error for Error {}

fn validate_timestamp(value: i64, field: &'static str) -> Result<(), Error> {
    if !(0..=MAX_TIMESTAMP).contains(&value) {
        return Err(Error::InvalidField {
            field,
            message: "Must be an integer between 0 and 9007199254740991.",
        });
    }
    Ok(())
}

fn validate_description(description: &str) -> Result<(), Error> {
    if description.chars().count() > 10_000 {
        return Err(Error::InvalidField {
            field: "description",
            message: "Must contain at most 10000 Unicode scalar values.",
        });
    }
    Ok(())
}

impl EntryInput {
    fn validate(mut self) -> Result<Self, Error> {
        if self.category_id.is_some_and(|id| id <= 0) {
            return Err(Error::InvalidField {
                field: "category_id",
                message: "Must be a positive integer.",
            });
        }
        self.title = self.title.trim().to_owned();
        if !(1..=500).contains(&self.title.chars().count()) {
            return Err(Error::InvalidField {
                field: "title",
                message: "Must contain 1 to 500 Unicode scalar values after trimming.",
            });
        }
        if let Some(description) = &self.description {
            validate_description(description)?;
        }
        validate_timestamp(self.start_time, "start_time")?;
        validate_timestamp(self.end_time, "end_time")?;
        if self.end_time < self.start_time {
            return Err(Error::InvalidTimeRange);
        }
        Ok(self)
    }
}

impl TimeRange {
    fn validate(self) -> Result<Self, Error> {
        validate_timestamp(self.from, "from")?;
        validate_timestamp(self.to, "to")?;
        if self.from >= self.to {
            return Err(Error::InvalidTimeRange);
        }
        Ok(self)
    }
}

fn validate_id(id: i64) -> Result<(), Error> {
    if id <= 0 {
        return Err(Error::InvalidField {
            field: "id",
            message: "Must be a positive integer.",
        });
    }
    Ok(())
}

// Worker futures need not be Send; callers use static dispatch.
#[allow(async_fn_in_trait)]
pub trait TimeEntryRepository {
    async fn create(&self, input: EntryInput) -> Result<TimeEntry, Error>;
    async fn list(&self, range: TimeRange) -> Result<Vec<TimeEntry>, Error>;
    async fn replace(&self, id: i64, input: EntryInput) -> Result<Option<TimeEntry>, Error>;
    async fn delete(&self, id: i64) -> Result<bool, Error>;
}

pub struct EntryService<R> {
    repository: R,
}

impl<R: TimeEntryRepository> EntryService<R> {
    pub fn new(repository: R) -> Self {
        Self { repository }
    }
    pub async fn create(&self, input: EntryInput) -> Result<TimeEntry, Error> {
        self.repository.create(input.validate()?).await
    }
    pub async fn list(&self, range: TimeRange) -> Result<Vec<TimeEntry>, Error> {
        self.repository.list(range.validate()?).await
    }
    pub async fn replace(&self, id: i64, input: EntryInput) -> Result<TimeEntry, Error> {
        validate_id(id)?;
        self.repository
            .replace(id, input.validate()?)
            .await?
            .ok_or(Error::NotFound)
    }
    pub async fn delete(&self, id: i64) -> Result<(), Error> {
        validate_id(id)?;
        if self.repository.delete(id).await? {
            Ok(())
        } else {
            Err(Error::NotFound)
        }
    }
}
