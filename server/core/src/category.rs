use crate::{Error, validate_id};
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CategoryColor {
    Red,
    Orange,
    Yellow,
    Green,
    Blue,
    Purple,
    Pink,
    Gray,
}

impl CategoryColor {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Red => "RED",
            Self::Orange => "ORANGE",
            Self::Yellow => "YELLOW",
            Self::Green => "GREEN",
            Self::Blue => "BLUE",
            Self::Purple => "PURPLE",
            Self::Pink => "PINK",
            Self::Gray => "GRAY",
        }
    }
}

impl FromStr for CategoryColor {
    type Err = Error;
    fn from_str(value: &str) -> Result<Self, Error> {
        match value {
            "RED" => Ok(Self::Red),
            "ORANGE" => Ok(Self::Orange),
            "YELLOW" => Ok(Self::Yellow),
            "GREEN" => Ok(Self::Green),
            "BLUE" => Ok(Self::Blue),
            "PURPLE" => Ok(Self::Purple),
            "PINK" => Ok(Self::Pink),
            "GRAY" => Ok(Self::Gray),
            _ => Err(Error::InvalidField {
                field: "color",
                message: "Must be RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, PINK, or GRAY.",
            }),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub color: CategoryColor,
}

pub struct CreateCategory {
    pub name: String,
    pub color: CategoryColor,
}

pub struct UpdateCategory {
    pub name: Option<String>,
    pub color: Option<CategoryColor>,
}

fn name(value: String) -> Result<String, Error> {
    let value = value.trim().to_owned();
    if !(1..=100).contains(&value.chars().count()) {
        return Err(Error::InvalidField {
            field: "name",
            message: "Must contain 1 to 100 Unicode scalar values after trimming.",
        });
    }
    Ok(value)
}

#[allow(async_fn_in_trait)]
pub trait CategoryRepository {
    async fn create(&self, input: CreateCategory) -> Result<Category, Error>;
    async fn list(&self) -> Result<Vec<Category>, Error>;
    async fn update(&self, id: i64, input: UpdateCategory) -> Result<Option<Category>, Error>;
    async fn delete(&self, id: i64) -> Result<bool, Error>;
}

pub struct CategoryService<R>(R);

impl<R: CategoryRepository> CategoryService<R> {
    pub fn new(repository: R) -> Self {
        Self(repository)
    }
    pub async fn create(&self, mut input: CreateCategory) -> Result<Category, Error> {
        input.name = name(input.name)?;
        self.0.create(input).await
    }
    pub async fn list(&self) -> Result<Vec<Category>, Error> {
        self.0.list().await
    }
    pub async fn update(&self, id: i64, mut input: UpdateCategory) -> Result<Category, Error> {
        validate_id(id)?;
        if input.name.is_none() && input.color.is_none() {
            return Err(Error::InvalidField {
                field: "body",
                message: "Provide at least one of name or color.",
            });
        }
        input.name = input.name.map(name).transpose()?;
        self.0
            .update(id, input)
            .await?
            .ok_or(Error::CategoryNotFound)
    }
    pub async fn delete(&self, id: i64) -> Result<(), Error> {
        validate_id(id)?;
        if self.0.delete(id).await? {
            Ok(())
        } else {
            Err(Error::CategoryNotFound)
        }
    }
}
