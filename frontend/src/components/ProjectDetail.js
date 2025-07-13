import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

function ProjectDetail() {
    const [project, setProject] = useState(null);
    const [newKeywords, setNewKeywords] = useState(''); // Stan dla textarea
    const { id } = useParams();

    useEffect(() => {
        const fetchProject = async () => {
            try {
                const response = await api.get(`/projects/${id}`);
                // Sortujemy słowa kluczowe, aby najnowsze były na górze
                response.data.keywords.sort((a, b) => b.id - a.id);
                setProject(response.data);
            } catch (error) {
                console.error("Error fetching project details:", error);
            }
        };
        fetchProject();
    }, [id]);

    // Funkcja do obsługi usuwania słowa kluczowego
    const handleDeleteKeyword = async (keywordId) => {
        if (window.confirm('Are you sure you want to delete this keyword?')) {
            try {
                await api.delete(`/projects/${id}/keywords/${keywordId}`);
                // Aktualizuj stan, usuwając keyword z listy
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

    // Funkcja do obsługi dodawania nowych słów kluczowych
    const handleAddKeywords = async (e) => {
        e.preventDefault();
        const keywordsArray = newKeywords.split('\n').map(k => k.trim()).filter(k => k);
        if (keywordsArray.length === 0) {
            alert('Please enter at least one keyword.');
            return;
        }
        try {
            const response = await api.post(`/projects/${id}/keywords`, { keywords: keywordsArray });
            // Dodaj nowe keywordy do istniejącej listy w stanie i posortuj
            setProject(prevProject => {
                const updatedKeywords = [...prevProject.keywords, ...response.data];
                updatedKeywords.sort((a, b) => b.id - a.id);
                return { ...prevProject, keywords: updatedKeywords };
            });
            setNewKeywords(''); // Wyczyść textarea
        } catch (error) {
            console.error("Error adding keywords:", error);
            alert('Failed to add keywords.');
        }
    };

    if (!project) return <div>Loading...</div>;

    return (
        <div style={{ fontFamily: 'sans-serif', maxWidth: '800px', margin: 'auto', padding: '20px' }}>
            <Link to="/">← Back to Dashboard</Link>
            <h2 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px' }}>{project.name}</h2>
            
            <div style={{ display: 'flex', gap: '40px' }}>
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
                    <h3>Keywords ({project.keywords.length})</h3>
                    <ul style={{ listStyle: 'none', padding: 0, maxHeight: '400px', overflowY: 'auto' }}>
                        {project.keywords.map(kw => (
                            <li key={kw.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderBottom: '1px solid #eee' }}>
                                <span>{kw.keyword} - (Status: {kw.status})</span>
                                <button onClick={() => handleDeleteKeyword(kw.id)} style={{ background: 'none', border: '1px solid #ff4d4d', color: '#ff4d4d', borderRadius: '4px', cursor: 'pointer' }}>
                                    Delete
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default ProjectDetail;