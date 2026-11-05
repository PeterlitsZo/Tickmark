CREATE TABLE todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Preserve title whitespace; core validates the complete Unicode scalar count.
    title TEXT NOT NULL CHECK (
        length(CAST(title AS BLOB)) BETWEEN 1 AND 2000 AND length(title) <= 500
    ),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETED')),
    created_at INTEGER NOT NULL CHECK (created_at BETWEEN 0 AND 9007199254740991),
    updated_at INTEGER NOT NULL CHECK (updated_at BETWEEN 0 AND 9007199254740991)
) STRICT;
