
-- Table to store WordPress projects
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    wp_url VARCHAR(255) NOT NULL,
    wp_user VARCHAR(255) NOT NULL,
    wp_password TEXT NOT NULL, -- This is the Application Password
    min_posts_per_day INT DEFAULT 1,
    max_posts_per_day INT DEFAULT 3,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table to store keywords for each project
CREATE TABLE keywords (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL,
    keyword TEXT NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Table to log published articles
CREATE TABLE articles (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL,
    keyword_id INT NOT NULL,
    wp_post_id INT NOT NULL,
    post_url TEXT NOT NULL,
    title TEXT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (keyword_id) REFERENCES keywords(id)
);
