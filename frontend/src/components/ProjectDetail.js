import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

function ProjectDetail() {
    const [project, setProject] = useState(null);
    const [newKeywords, setNewKeywords] = useState('');
    const [selectedKeywords, setSelectedKeywords] = useState(new Set());
    const { id } = useParams();

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
    }, [id]);

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

    const handleSelectAll = () => {
        const areAllSelected = project.keywords && project.keywords.length > 0 && selectedKeywords.size === project.keywords.length;

        if (areAllSelected) {
            setSelectedKeywords(new Set());
        } else {
            const allKeywordIds = project.keywords.map(kw => kw.id);
            setSelectedKeywords(new Set(allKeywordIds));
        }
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

    const areAllKeywordsSelected = project.keywords && project.keywords.length > 0 && selectedKeywords.size === project.keywords.length;

    const handleExportKeywords = async () => {
        try {
            const response = await api.get(`/projects/${id}/keywords/export`, {
                responseType: 'blob'
            });
            
            // Utwórz URL dla pliku
            const url = window.URL.createObjectURL(new Blob([response.data]));
            
            // Utwórz link do pobrania
            const link = document.createElement('a');
            link.href = url;
            
            // Pobierz nazwę pliku z nagłówka lub użyj domyślnej
            const disposition = response.headers['content-disposition'];
            let filename = `keywords_export_${new Date().toISOString().split('T')[0]}.csv`;
            if (disposition) {
                const filenameMatch = disposition.match(/filename="?(.+)"?/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error exporting keywords:", error);
            alert('Failed to export keywords.');
        }
    };

    return (
        <div style={{ fontFamily: 'sans-serif', maxWidth: '1200px', margin: 'auto', padding: '20px' }}>
            <Link to="/">← Back to Dashboard</Link>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>{project.name}</h2>
                <div style={{ fontSize: '1.1em', color: '#666' }}>
                    Keywords: <strong>{project.used_keywords_count || 0}/{project.total_keywords_count || 0} used</strong>
                </div>
            </div>
            
            {/* ================================================================= */}
            {/* ZMIANA: Zmienione proporcje flex, aby dać więcej miejsca liście   */}
            {/* ================================================================= */}
            <div style={{ display: 'flex', gap: '40px', marginBottom: '20px' }}>
                <div style={{ flex: '0 0 350px' }}>
                    <h3>Add New Keywords</h3>
                    <form onSubmit={handleAddKeywords}>
                        <textarea rows="10" style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} value={newKeywords} onChange={(e) => setNewKeywords(e.target.value)} placeholder="Enter keywords, one per line..."></textarea>
                        <br />
                        <button type="submit" style={{ marginTop: '10px', padding: '10px 15px' }}>Add Keywords</button>
                    </form>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Keywords ({project.keywords && project.keywords.length})</h3>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                                onClick={handleExportKeywords} 
                                style={{ 
                                    background: '#28a745', 
                                    color: 'white', 
                                    border: 'none', 
                                    padding: '8px 12px', 
                                    borderRadius: '4px', 
                                    cursor: 'pointer' 
                                }}
                            >
                                Export All Keywords
                            </button>
                            {selectedKeywords.size > 0 && (
                                <button onClick={handleBulkDelete} style={{ background: '#ff4d4d', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                                    Delete Selected ({selectedKeywords.size})
                                </button>
                            )}
                        </div>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee' }}>
                        {project.keywords && project.keywords.length > 0 && (
                             <li style={{ display: 'flex', alignItems: 'center', padding: '8px', borderBottom: '1px solid #ccc', background: '#f7f7f7', fontWeight: 'bold' }}>
                                <input
                                    type="checkbox"
                                    checked={areAllKeywordsSelected}
                                    onChange={handleSelectAll}
                                    style={{ marginRight: '10px' }}
                                    title="Select/Deselect All"
                                />
                                <span>Select All</span>
                            </li>
                        )}

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