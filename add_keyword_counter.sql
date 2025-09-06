-- Migration to add keyword usage counter support
-- This adds a column to track used keywords count in projects table

-- Add used_keywords_count column to projects table
ALTER TABLE projects ADD COLUMN used_keywords_count INT DEFAULT 0;

-- Create function to update used keywords count
CREATE OR REPLACE FUNCTION update_used_keywords_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the count when scheduled_post status changes to 'completed'
    IF TG_OP = 'UPDATE' AND OLD.status != 'completed' AND NEW.status = 'completed' THEN
        UPDATE projects 
        SET used_keywords_count = (
            SELECT COUNT(DISTINCT keyword_id) 
            FROM scheduled_posts 
            WHERE project_id = NEW.project_id AND status = 'completed'
        )
        WHERE id = NEW.project_id;
    END IF;
    
    -- Update the count when scheduled_post is deleted
    IF TG_OP = 'DELETE' AND OLD.status = 'completed' THEN
        UPDATE projects 
        SET used_keywords_count = (
            SELECT COUNT(DISTINCT keyword_id) 
            FROM scheduled_posts 
            WHERE project_id = OLD.project_id AND status = 'completed'
        )
        WHERE id = OLD.project_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update used keywords count
CREATE TRIGGER trigger_update_used_keywords_count
    AFTER UPDATE OR DELETE ON scheduled_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_used_keywords_count();

-- Initialize existing projects with current count
UPDATE projects SET used_keywords_count = (
    SELECT COUNT(DISTINCT sp.keyword_id)
    FROM scheduled_posts sp
    WHERE sp.project_id = projects.id AND sp.status = 'completed'
);