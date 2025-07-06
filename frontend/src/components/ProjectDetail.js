
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api';

function ProjectDetail() {
    const [project, setProject] = useState(null);
    const [articles, setArticles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
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
            // POPRAWKA: Usunęliśmy trzeci argument z ręcznym ustawianiem nagłówków.
            // Axios sam ustawi poprawny Content-Type dla FormData.
            const res = await api.post(`/projects/${id}/keywords`, formData);

            // POPRAWKA: Bezpiecznie odczytujemy wiadomość z odpowiedzi JSON
            setMessage(res.data.message);

            setSelectedFile(null);
            // Resetujemy pole input pliku, aby można było wgrać ten sam plik ponownie
            e.target.reset(); 
            // Odświeżamy listę, aby zobaczyć nowe dane (w przyszłości np. licznik słów kluczowych)
            // fetchProjectDetails(); 
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
