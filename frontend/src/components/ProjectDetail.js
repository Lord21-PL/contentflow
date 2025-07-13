import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

function ProjectDetail() {
    const [project, setProject] = useState(null);
    const [newKeywords, setNewKeywords] = useState('');
    const [selectedKeywords, setSelectedKeywords] = useState(new Set());
    const { id } = useParams();

    // =================================================================
    // POPRAWKA: Funkcja fetchProject jest teraz zdefiniowana wewnątrz useEffect
    // =================================================================
    useEffect(() => {
        const fetchProject = async () => {
            try {
                const response = await api.get(`/projects/${id}`);
                if (response.data.keywords) {
                    response.data.keywords.sort((a, b) => b.id - a.id);
                }
                setProject(response.data);
            } catch (error) {
                console.error("Error fetching project details:", error);
            }
        };

        fetchProject();
    }, [id]); // Teraz zależności są poprawne. useEffect zależy tylko od `id`.

    const handleKeywordSelection = (keywordId) => {
        setSelectedKeywords(prevSelected => {
            const newSelected = new Set(prevSelected);
            if (newSelected.has(keywordId)) {
                newSelected.delete(keywordId);
            } else {
                newSelected.add(keywordId);
            }
            return newSelected;
        });
    };

    const handleBulkDelete = async () => {
        if (selectedKeywords.size === 0) {
            alert('Please select keywords to delete.');
            return;
        }
        if (window.confirm(`Are you sure you want to delete ${selectedKeywords.size} selected keywords?`)) {
            try {
                await api.delete(`/projects/${id}/keywords`, {
                    data: { keywordIds: Array.from(selectedKeywords) }
                });
                setSelectedKeywords(new Set());
                // Odświeżamy dane, pobierając je ponownie
                const response = await api.get(`/projects/${id}`);
                setProject(response.data);
            } catch (error) {
                console.error("Error bulk deleting keywords:", error);
                alert('Failed to delete keywords.');
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
            await api.post(`/projects/${id}/keywords`, { keywords: keywordsArray });
            setNewKeywords('');
            // Odświeżamy dane, pobierając je ponownie
            const response = await api.get(`/projects/${id}`);
            setProject(response.data);
        } catch (error) {
            console.error("Error adding keywords:", error);
            alert('Failed to add keywords.');
        }
    };

    if (!project) return <div>Loading...</div>;

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
            
            <div style={{ display: 'flex', gap: '40px', marginBottom: '20px' }}>
                <div style={{ flex: 1 }}>
                    <h3>Add New Keywords</h3>
                    <form onSubmit={handleAddKeywords}>
                        <textarea rows="10" style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} placeholder="Enter keywords, one per line..."></textarea>
                        <br />
                        <button type="submit" style={{ marginTop: '10px', padding: '10px 15px' }}>Add Keywords</button>
                    </form>
                </div>
                <div style={{ flex: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Keywords ({project.keywords && project.keywords.length})</h3>
                        {selectedKeywords.size > 0 && (
                            <button onClick={handleBulkDelete} style={{ background: '#ff4d4d', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                                Delete Selected ({selectedKeywords.size})
                            </button>
                        )}
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee' }}>
                        {project.keywords && project.keywords.map(kw => (
                            <li key={kw.id} style={{ display: 'flex', alignItems: 'center', padding: '8px', borderBottom: '1px solid #eee' }}>
                                <input type="checkbox" checked={selectedKeywords.has(kw.id)} onChange={() => handleKeywordSelection(kw.id)} style={{ marginRight: '10px' }} />
                                <span>{kw.keyword}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <hr style={{ margin: '40px 0' }} />

            <h3>Scheduled / Processed Articles</h3>
            <ul style={{ listStyle: 'none', padding: 0, maxHeight: '500px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '5px' }}>
                {project.scheduledPosts && project.scheduledPosts.map(post => (
                    <li key={post.id} style={{ borderBottom: '1px solid #eee', padding: '15px' }}>
                        <strong>Keyword:</strong> {post.keyword}
                        <br />
                        <strong>Status:</strong> <span style={getStatusStyle(post.status)}>{post.status}</span>
                        <br />
                        <strong>Scheduled for:</strong> {new Date(post.publish_at).toLocaleString()}
                        {post.status === 'completed' && post.wordpress_post_url && (
                            <span><br /><strong>URL:</strong> <a href={post.wordpress_post_url} target="_blank" rel="noopener noreferrer">{post.wordpress_post_url}</a></span>
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