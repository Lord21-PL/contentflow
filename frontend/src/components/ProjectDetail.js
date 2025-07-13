import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

function ProjectDetail() {
    const [project, setProject] = useState(null);
    const [newKeywords, setNewKeywords] = useState('');
    const { id } = useParams();

    useEffect(() => {
        const fetchProject = async () => {
            try {
                const response = await api.get(`/projects/${id}`);
                // Sortujemy, aby najnowsze były na górze
                if (response.data.keywords) {
                    response.data.keywords.sort((a, b) => b.id - a.id);
                }
                // scheduledPosts są już posortowane przez backend
                setProject(response.data);
            } catch (error) {
                console.error("Error fetching project details:", error);
            }
        };
        fetchProject();
    }, [id]);

    const handleDeleteKeyword = async (keywordId) => {
        if (window.confirm('Are you sure you want to delete this keyword?')) {
            try {
                await api.delete(`/projects/${id}/keywords/${keywordId}`);
                setProject(prevProject => ({
                    ...prevProject,
                    keywords: prevProject.keywords.filter(kw => kw.id !== keywordId)
                }));
            } catch (error) {
                console.error("Error deleting keyword:", error);
                alert('Failed to delete keyword.');
            }
        }
    };

    const handleAddKeywords = async (e) => {
        e.preventDefault();
        const keywordsArray = newKeywords.split('\n').map(k => k.trim()).filter(k => k);
        if (keywordsArray.length === 0) {
            alert('Please enter at least one keyword.');
            return;
        }
        try {
            const response = await api.post(`/projects/${id}/keywords`, { keywords: keywordsArray });
            setProject(prevProject => {
                const updatedKeywords = [...prevProject.keywords, ...response.data];
                updatedKeywords.sort((a, b) => b.id - a.id);
                return { ...prevProject, keywords: updatedKeywords };
            });
            setNewKeywords('');
        } catch (error) {
            console.error("Error adding keywords:", error);
            alert('Failed to add keywords.');
        }
    };

    if (!project) return <div>Loading...</div>;

    // Funkcja pomocnicza do stylizacji statusu
    const getStatusStyle = (status) => {
        switch (status) {
            case 'completed': return { color: 'green', fontWeight: 'bold' };
            case 'failed': return { color: 'red', fontWeight: 'bold' };
            case 'pending': return { color: 'orange', fontWeight: 'bold' };
            case 'processing': return { color: 'blue', fontWeight: 'bold' };
            default: return {};
        }
    };

    return (
        <div style={{ fontFamily: 'sans-serif', maxWidth: '960px', margin: 'auto', padding: '20px' }}>
            <Link to="/">← Back to Dashboard</Link>
            <h2 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px' }}>{project.name}</h2>
            
            {/* SEKCJA ZARZĄDZANIA KEYWORDAMI */}
            <div style={{ display: 'flex', gap: '40px', marginBottom: '20px' }}>
                <div style={{ flex: 1 }}>
                    <h3>Add New Keywords</h3>
                    <form onSubmit={handleAddKeywords}>
                        <textarea
                            rows="10"
                            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                            value={newKeywords}
                            onChange={(e) => setNewKeywords(e.target.value)}
                            placeholder="Enter keywords, one per line..."
                        ></textarea>
                        <br />
                        <button type="submit" style={{ marginTop: '10px', padding: '10px 15px' }}>Add Keywords</button>
                    </form>
                </div>
                <div style={{ flex: 2 }}>
                    <h3>Keywords ({project.keywords && project.keywords.length})</h3>
                    <ul style={{ listStyle: 'none', padding: 0, maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee' }}>
                        {project.keywords && project.keywords.map(kw => (
                            <li key={kw.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderBottom: '1px solid #eee' }}>
                                <span>{kw.keyword}</span>
                                <button onClick={() => handleDeleteKeyword(kw.id)} style={{ background: 'none', border: '1px solid #ff4d4d', color: '#ff4d4d', borderRadius: '4px', cursor: 'pointer' }}>
                                    Delete
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <hr style={{ margin: '40px 0' }} />

            {/* ================================================================= */}
            {/* NOWA/PRZYWRÓCONA SEKCJA: LISTA ZAPLANOWANYCH POSTÓW */}
            {/* ================================================================= */}
            <h3>Scheduled / Processed Articles</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
                {project.scheduledPosts && project.scheduledPosts.map(post => (
                    <li key={post.id} style={{ border: '1px solid #ddd', padding: '15px', marginBottom: '10px', borderRadius: '5px' }}>
                        <strong>Keyword:</strong> {post.keyword}
                        <br />
                        <strong>Status:</strong> <span style={getStatusStyle(post.status)}>{post.status}</span>
                        <br />
                        <strong>Scheduled for:</strong> {new Date(post.publish_at).toLocaleString()}
                        {post.status === 'completed' && post.wordpress_post_url && (
                            <span>
                                <br />
                                <strong>URL:</strong> <a href={post.wordpress_post_url} target="_blank" rel="noopener noreferrer">{post.wordpress_post_url}</a>
                            </span>
                        )}
                        {post.status === 'failed' && post.error_message && (
                            <div style={{ marginTop: '10px', padding: '10px', background: '#fff0f0', border: '1px solid red', color: '#333', fontSize: '0.9em' }}>
                                <strong>Error:</strong> {post.error_message}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default ProjectDetail;