ALTER TABLE todos ADD COLUMN expected_daily_minutes INTEGER
    CHECK (expected_daily_minutes IS NULL OR expected_daily_minutes BETWEEN 1 AND 1440);

CREATE TABLE todo_daily_effort (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    minutes INTEGER NOT NULL CHECK (minutes BETWEEN 0 AND 1440),
    PRIMARY KEY (todo_id, local_date)
) STRICT;
