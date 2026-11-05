-- Core validates the Unicode scalar limit and preserves the original text.
ALTER TABLE todos ADD COLUMN description TEXT NOT NULL DEFAULT '';
