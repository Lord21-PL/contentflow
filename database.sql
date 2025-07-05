
-- This file should be appended to your existing database.sql
-- or run on your database to add the new scheduling functionality.

-- New table for scheduling posts
CREATE TYPE post_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE scheduled_posts (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL,
    keyword_id INT NOT NULL,
    publish_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status post_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE CASCADE
);

-- Add an index for faster lookups by the executor
CREATE INDEX idx_scheduled_posts_pending ON scheduled_posts (publish_at) WHERE status = 'pending';
