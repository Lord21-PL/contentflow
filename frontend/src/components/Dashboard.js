
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || '/api';

function Dashboard() {
    const [projects, setProjects] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        wp_url: '',
        wp_user: '',
        wp_password: '',
        min_posts_per_day: 1,
        max_posts_per_day: 3,
    });

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            const res = await axios.get(`${API_URL}/projects`);
            setProjects(res.data);
        } catch (error) {
            console.error('Error fetching projects:', error);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API_URL}/projects`, formData);
            fetchProjects(); // Refresh list
            setFormData({ name: '', wp_url: '', wp_user: '', wp_password: '', min_posts_per_day: 1, max_posts_per_day: 3 });
        } catch (error) {
            console.error('Error creating project:', error);
        }
    };

    return (
        <div className="flex-container">
            <div className="flex-item-2">
                <h2>Projects Dashboard</h2>
                <div className="project-list">
                    {projects.map((project) => (
                        <Link to={`/project/${project.id}`} key={project.id}>
                            <div className="card project-item">
                                <h3>{project.name}</h3>
                                <p>{project.wp_url}</p>
                                <p>Keywords: {project.used_keywords} / {project.total_keywords}</p>
                                <div className="status-bar">
                                    <div className="status-bar-filled" style={{ width: `${project.total_keywords > 0 ? (project.used_keywords / project.total_keywords) * 100 : 0}%` }}></div>
                                </div>
                                <p style={{fontSize: '0.8rem', marginTop: '0.5rem'}}>Posts per day: {project.min_posts_per_day} - {project.max_posts_per_day}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            <div className="flex-item-1">
                <div className="card">
                    <h2>Add New Project</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Project Name</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} required />
                        </div>
                        <div className="form-group">
                            <label>WordPress URL</label>
                            <input type="url" name="wp_url" value={formData.wp_url} onChange={handleChange} placeholder="https://example.com" required />
                        </div>
                        <div className="form-group">
                            <label>WordPress User</label>
                            <input type="text" name="wp_user" value={formData.wp_user} onChange={handleChange} required />
                        </div>
                        <div className="form-group">
                            <label>WordPress Application Password</label>
                            <input type="password" name="wp_password" value={formData.wp_password} onChange={handleChange} required />
                        </div>
                        <div className="form-group">
                            <label>Min Posts/Day</label>
                            <input type="number" name="min_posts_per_day" value={formData.min_posts_per_day} onChange={handleChange} min="1" required />
                        </div>
                        <div className="form-group">
                            <label>Max Posts/Day</label>
                            <input type="number" name="max_posts_per_day" value={formData.max_posts_per_day} onChange={handleChange} min="1" required />
                        </div>
                        <button type="submit" className="btn btn-primary">Add Project</button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
