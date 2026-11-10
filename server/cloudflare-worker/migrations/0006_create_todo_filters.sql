CREATE TABLE todo_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    filter_expr TEXT NOT NULL CHECK (length(CAST(filter_expr AS BLOB)) BETWEEN 1 AND 4096),
    position INTEGER NOT NULL CHECK (position >= 0),
    created_at INTEGER NOT NULL CHECK (created_at BETWEEN 0 AND 9007199254740991),
    updated_at INTEGER NOT NULL CHECK (updated_at BETWEEN 0 AND 9007199254740991)
) STRICT;
CREATE INDEX todo_filters_order ON todo_filters(position, id);
