-- Core validates the Unicode scalar limit and preserves the original text.
ALTER TABLE time_entries ADD COLUMN description TEXT NOT NULL DEFAULT '';
