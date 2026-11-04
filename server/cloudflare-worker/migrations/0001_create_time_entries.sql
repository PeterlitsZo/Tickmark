CREATE TABLE time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- SQLite length(TEXT) stops at NUL; core validates the complete scalar count.
    title TEXT NOT NULL CHECK (
        length(CAST(title AS BLOB)) BETWEEN 1 AND 2000 AND length(title) <= 500
    ),
    start_time INTEGER NOT NULL CHECK (start_time BETWEEN 0 AND 9007199254740991),
    end_time INTEGER NOT NULL CHECK (end_time BETWEEN 0 AND 9007199254740991),
    CHECK (end_time >= start_time)
) STRICT;

CREATE INDEX time_entries_start_id ON time_entries (start_time ASC, id ASC);
