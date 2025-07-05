
import React, { useState, useEffect, useCallback } from 'react'; // 1. Import useCallback
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || '/api';

function ProjectDetail() {
    const [project, setProject] = useState(null);
    const [articles, setArticles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [message, setMessage] = useState('');
    const { id } = useParams();

    // 2. Opakuj funkcję w useCallback
    // Zapewnia to, że funkcja nie jest tworzona na nowo przy każdym renderze,
    // chyba że jej zależności (tutaj 'id') się zmienią.
    const fetchProjectDetails = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/projects/${id}`);
            setProject(res.data.project);
            setArticles(res.data.articles);
        } catch (error) {
            console.error('Error fetching project details:', error);
        }
    }, [id]); // Zależnością jest 'id', bo zapytanie API od niego zależy

    useEffect(() => {
        fetchProjectDetails();
    }, [fetchProjectDetails]); // 3. Dodaj fetchProjectDetails do tablicy zależności

    const handleFileChange = (e) => {
        setSelectedFile(e.target.files[0]);
    };

    const handleKeywordUpload = async (e) => {
        e.preventDefault();
        if (!selectedFile) {
            setMessage('Please select a file first.');
            return;
        }

        const formData = new FormData();
        formData.append('keywordsFile', selectedFile);

        try {
            const res = await axios.post(`${API_URL}/projects/${id}/keywords`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            setMessage(res.data);
            setSelectedFile(null);
            // Po udanym wgraniu, odśwież dane
            fetchProjectDetails();
        } catch (error) {
            console.error('Error uploading keywords:', error);
            setMessage('Error uploading file.');
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
                                <input type="file" onChange={handleFileChange} accept=".txt,.csv" />
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
