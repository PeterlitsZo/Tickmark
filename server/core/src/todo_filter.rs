use filter_expr::FilterExpr;
use filter_expr_evaler::{FilterExprEvaler, simple_context};

use crate::{Error, Todo};

pub(crate) struct TodoFilter(FilterExpr);

impl TodoFilter {
    pub(crate) fn parse(expression: &str) -> Result<Self, Error> {
        if expression.len() > 4096 {
            return Err(Error::InvalidFilter(
                "Decoded filter must not exceed 4096 bytes.",
            ));
        }
        let filter = FilterExpr::parse(expression)
            .map_err(|_| Error::InvalidFilter("Provide a valid filter expression."))?;
        Ok(Self(filter))
    }

    pub(crate) async fn apply(self, items: Vec<Todo>) -> Result<Vec<Todo>, Error> {
        if self.0.is_empty() || items.is_empty() {
            return Ok(items);
        }
        let evaluator = FilterExprEvaler::new();
        let mut matches = Vec::new();
        for todo in items {
            let context = simple_context! {
                "id": todo.id.to_string(),
                "title": todo.title.clone(),
                "status": todo.status.as_str(),
                "created_at": todo.created_at,
                "updated_at": todo.updated_at,
            };
            if evaluator.eval(&self.0, &context).await.map_err(|_| {
                Error::InvalidFilter("Filter must evaluate to a boolean without errors.")
            })? {
                matches.push(todo);
            }
        }
        Ok(matches)
    }
}
