
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import ProjectForm from './ProjectForm';

const API_URL = process.env.REACT_APP_API_URL || '/api';

function Dashboard() {
    const [projects, setProjects] = useState([]);

    const fetchProjects = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/projects`);
            setProjects(res.data);
        } catch (error) {
            console.error('Error fetching projects:', error);
        }
    }, []);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    // NOWA FUNKCJA DO OBSŁUGI USUWANIA
    const handleDeleteProject = async (projectId) => {
        // Zawsze prosimy o potwierdzenie przed destrukcyjną akcją!
        if (window.confirm('Are you sure you want to delete this project and all its data? This action cannot be undone.')) {
            try {
                await axios.delete(`${API_URL}/projects/${projectId}`);
                // Po pomyślnym usunięciu, filtrujemy stan, aby natychmiast usunąć projekt z widoku
                setProjects(projects.filter(p => p.id !== projectId));
            } catch (error) {
                console.error('Error deleting project:', error);
                alert('Failed to delete the project.');
            }
        }
    };

    return (
        <div>
            <div className="flex-container" style={{ alignItems: 'flex-start' }}>
                <div className="flex-item-1">
                    <ProjectForm onProjectCreated={fetchProjects} />
                </div>
                <div className="flex-item-2">
                    <div className="card">
                        <h3>Your Projects</h3>
                        <ul className="project-list">
                            {projects.map(project => (
                                <li key={project.id}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <Link to={`/project/${project.id}`}>{project.name}</Link>
                                            <div style={{ fontSize: '0.8em', color: '#666', marginTop: '4px' }}>
                                                Keywords: {project.used_keywords_count || 0}/{project.total_keywords_count || 0} used
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDeleteProject(project.id)}
                                            className="btn btn-danger btn-sm"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
