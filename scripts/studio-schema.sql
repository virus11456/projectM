CREATE TABLE IF NOT EXISTS studio_documents (
 id uuid PRIMARY KEY, owner text NOT NULL, kind text NOT NULL,
 input jsonb NOT NULL, input_hash text NOT NULL, model text NOT NULL,
 status text NOT NULL DEFAULT 'pending', document jsonb, usage jsonb,
 version integer NOT NULL DEFAULT 1,
 publish_status text NOT NULL DEFAULT 'none', notion_id text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_documents_owner_created ON studio_documents(owner,created_at DESC);
