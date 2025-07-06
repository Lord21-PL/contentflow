
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

function ProjectDetail() {
    const [project, setProject] = useState(null);
    const [articles, setArticles] = useState([]);
    const [scheduledPosts, setScheduledPosts] = useState([]);
    const [message, setMessage] = useState('');
    const { id } = useParams();

    const fetchProjectDetails = useCallback(async () => {
        try {
            const res = await api.get(`/projects/${id}`);
            setProject(res.data.project);
            setArticles(res.data.articles);
            setScheduledPosts(res.data.scheduledPosts);
        } catch (error) {
            console.error('Error fetching project details:', error);
        }
    }, [id]);

    useEffect(() => {
        fetchProjectDetails();
    }, [fetchProjectDetails]);

    const handleKeywordUpload = async (e) => {
        e.preventDefault();
        setMessage('');

        const formData = new FormData(e.target);

        if (!formData.get('keywordsFile') || formData.get('keywordsFile').size === 0) {
            setMessage('Please select a file first.');
            return;
        }

        try {
            const res = await api.post(`/projects/${id}/keywords`, formData);
            setMessage(res.data.message);
            e.target.reset();
            // After uploading keywords, refresh all data to see new scheduled posts
            fetchProjectDetails(); 
        } catch (error) {
            const errorMsg = error.response?.data?.message || 'Error uploading file.';
            setMessage(errorMsg);
            console.error('Error uploading keywords:', error);
        }
    };

    if (!project) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <Link to="/">&larr; Back to Dashboard</Link>
            <h2>{project.name}</h2>
            <p>{project.wp_url}</p>

            {/* NEW: Publication Schedule Section */}
            <div className="card">
                <h3>Publication Schedule</h3>
                {scheduledPosts.length > 0 ? (
                    <table className="article-table">
                        <thead>
                            <tr>
                                <th>Keyword</th>
                                <th>Scheduled For</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {scheduledPosts.map(post => (
                                <tr key={post.id}>
                                    <td>{post.keyword}</td>
                                    <td>{new Date(post.publish_at).toLocaleString()}</td>
                                    <td>
                                        <span className={`status-badge status-${post.status}`}>
                                            {post.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p>No posts are currently scheduled. The planner will schedule new posts soon.</p>
                )}
            </div>

            <div className="flex-container" style={{marginTop: '1rem'}}>
                <div className="flex-item-1">
                    <div className="card">
                        <h3>Upload Keywords</h3>
                        <p>Upload a .txt or .csv file with one keyword per line.</p>
                        <form onSubmit={handleKeywordUpload}>
                            <div className="form-group">
                                <input type="file" name="keywordsFile" accept=".txt,.csv" />
                            </div>
                            <button type="submit" className="btn btn-primary">Upload</button>
                        </form>
                        {message && <p style={{marginTop: '1rem'}}>{message}</p>}
                    </div>
                </div>
                <div className="flex-item-2">
                     <div className="card">
                        <h3>Published Articles</h3>
                        {articles.length > 0 ? (
                            <table className="article-table">
                                <thead>
                                    <tr>
                                        <th>Title</th>
                                        <th>Published At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {articles.map(article => (
                                        <tr key={article.id}>
                                            <td><a href={article.post_url} target="_blank" rel="noopener noreferrer">{article.title}</a></td>
                                            <td>{new Date(article.published_at).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p>No articles have been published for this project yet.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ProjectDetail;
