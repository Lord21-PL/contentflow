import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

function ProjectDetail() {
    const [project, setProject] = useState(null);
    const [articles, setArticles] = useState([]);
    const [message, setMessage] = useState('');
    const { id } = useParams();

    const fetchProjectDetails = useCallback(async () => {
        try {
            const res = await api.get(`/projects/${id}`);
            setProject(res.data.project);
            setArticles(res.data.articles);
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
        
        // UPROSZCZONA I BARDZIEJ NIEZAWODNA LOGIKA:
        // Tworzymy FormData bezpośrednio z elementu formularza.
        // To automatycznie pobierze plik z inputu, który ma poprawny atrybut 'name'.
        const formData = new FormData(e.target);

        // Sprawdzamy, czy plik został faktycznie wybrany
        if (!formData.get('keywordsFile') || formData.get('keywordsFile').size === 0) {
            setMessage('Please select a file first.');
            return;
        }

        try {
            const res = await api.post(`/projects/${id}/keywords`, formData);
            setMessage(res.data.message);
            e.target.reset(); // Czyścimy formularz po sukcesie
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

            <div className="flex-container">
                <div className="flex-item-1">
                    <div className="card">
                        <h3>Upload Keywords</h3>
                        <p>Upload a .txt or .csv file with one keyword per line.</p>
                        <form onSubmit={handleKeywordUpload}>
                            <div className="form-group">
                                {/* KRYTYCZNA POPRAWKA: Dodany atrybut name="keywordsFile" */}
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
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ProjectDetail;