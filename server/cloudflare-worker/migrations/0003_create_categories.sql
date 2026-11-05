CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Core validates the complete Unicode scalar count, including embedded NULs.
    name TEXT NOT NULL CHECK (
        length(CAST(name AS BLOB)) BETWEEN 1 AND 400 AND length(name) <= 100
    ),
    color TEXT NOT NULL CHECK (
        color IN ('RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE', 'PURPLE', 'PINK', 'GRAY')
    )
) STRICT;

INSERT INTO categories (name, color)
SELECT 'Default', 'GRAY'
WHERE EXISTS (SELECT 1 FROM time_entries)
  AND NOT EXISTS (SELECT 1 FROM categories);

CREATE TABLE time_entries_categorized (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (
        length(CAST(title AS BLOB)) BETWEEN 1 AND 2000 AND length(title) <= 500
    ),
    start_time INTEGER NOT NULL CHECK (start_time BETWEEN 0 AND 9007199254740991),
    end_time INTEGER NOT NULL CHECK (end_time BETWEEN 0 AND 9007199254740991),
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    CHECK (end_time >= start_time)
) STRICT;

INSERT INTO time_entries_categorized (id, title, start_time, end_time, category_id)
SELECT id, title, start_time, end_time, (SELECT MIN(id) FROM categories)
FROM time_entries;

-- Preserve IDs that were allocated and subsequently deleted as well.
UPDATE sqlite_sequence
SET seq = MAX(seq, COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'time_entries'), 0))
WHERE name = 'time_entries_categorized';

DROP TABLE time_entries;
ALTER TABLE time_entries_categorized RENAME TO time_entries;
CREATE INDEX time_entries_start_id ON time_entries (start_time ASC, id ASC);
CREATE INDEX time_entries_category_id ON time_entries (category_id);
