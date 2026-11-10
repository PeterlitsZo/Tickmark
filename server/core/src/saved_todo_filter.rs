use crate::{Error, TodoRepository, todo_filter::TodoFilter, validate_id, validate_timestamp};

#[derive(Debug, Clone)]
pub struct SavedTodoFilter {
    pub id: i64,
    pub name: String,
    pub filter_expr: String,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct CreateTodoFilter {
    pub name: String,
    pub filter_expr: String,
}

pub struct UpdateTodoFilter {
    pub name: Option<String>,
    pub filter_expr: Option<String>,
}

fn name(value: String) -> Result<String, Error> {
    let value = value.trim().to_owned();
    if !(1..=60).contains(&value.chars().count()) {
        return Err(Error::InvalidField {
            field: "name",
            message: "Use 1 to 60 characters after trimming.",
        });
    }
    Ok(value)
}

#[allow(async_fn_in_trait)]
pub trait TodoFilterRepository {
    async fn list(&self) -> Result<Vec<SavedTodoFilter>, Error>;
    async fn create(&self, input: CreateTodoFilter, now: i64) -> Result<SavedTodoFilter, Error>;
    async fn update(
        &self,
        id: i64,
        input: UpdateTodoFilter,
        now: i64,
    ) -> Result<Option<SavedTodoFilter>, Error>;
    async fn delete(&self, id: i64) -> Result<bool, Error>;
}

pub struct TodoFilterService<R, T> {
    repository: R,
    todos: T,
}

impl<R: TodoFilterRepository, T: TodoRepository> TodoFilterService<R, T> {
    pub fn new(repository: R, todos: T) -> Self {
        Self { repository, todos }
    }

    async fn expression(&self, value: String) -> Result<String, Error> {
        if value.trim().is_empty() {
            return Err(Error::InvalidFilter(
                "Enter a condition, or use the All tab to see all todos.",
            ));
        }
        // Check the original byte length, including whitespace, before storage access.
        let filter = TodoFilter::parse(&value)?;
        filter.apply(self.todos.list().await?).await?;
        Ok(value)
    }

    pub async fn list(&self) -> Result<Vec<SavedTodoFilter>, Error> {
        self.repository.list().await
    }

    pub async fn create(
        &self,
        input: CreateTodoFilter,
        now: i64,
    ) -> Result<SavedTodoFilter, Error> {
        validate_timestamp(now, "created_at")?;
        let input = CreateTodoFilter {
            name: name(input.name)?,
            filter_expr: self.expression(input.filter_expr).await?,
        };
        self.repository.create(input, now).await
    }

    pub async fn update(
        &self,
        id: i64,
        input: UpdateTodoFilter,
        now: i64,
    ) -> Result<SavedTodoFilter, Error> {
        validate_id(id)?;
        validate_timestamp(now, "updated_at")?;
        if input.name.is_none() && input.filter_expr.is_none() {
            return Err(Error::InvalidField {
                field: "body",
                message: "Provide name and/or filter_expr.",
            });
        }
        let input = UpdateTodoFilter {
            name: input.name.map(name).transpose()?,
            filter_expr: match input.filter_expr {
                Some(value) => Some(self.expression(value).await?),
                None => None,
            },
        };
        self.repository
            .update(id, input, now)
            .await?
            .ok_or(Error::TodoFilterNotFound)
    }

    pub async fn delete(&self, id: i64) -> Result<(), Error> {
        validate_id(id)?;
        if self.repository.delete(id).await? {
            Ok(())
        } else {
            Err(Error::TodoFilterNotFound)
        }
    }
}
