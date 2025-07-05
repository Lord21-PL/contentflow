import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

function ProjectForm({ onProjectCreated }) {
    const [name, setName] = useState('');
    const [wp_url, setWpUrl] = useState('');
    const [wp_user, setWpUser] = useState('');
    const [wp_password, setWpPassword] = useState('');
    const [min_posts_per_day, setMinPosts] = useState(1);
    const [max_posts_per_day, setMaxPosts] = useState(3);
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        try {
            const projectData = { name, wp_url, wp_user, wp_password, min_posts_per_day, max_posts_per_day };
            await axios.post(`${API_URL}/projects`, projectData);
            
            // Clear form
            setName('');
            setWpUrl('');
            setWpUser('');
            setWpPassword('');
            setMinPosts(1);
            setMaxPosts(3);

            setMessage('Project created successfully!');
            
            // Notify parent component to refresh the list
            if (onProjectCreated) {
                onProjectCreated();
            }

        } catch (error) {
            console.error('Error creating project:', error);
            setMessage('Error creating project. Please check console.');
        }
    };

    return (
        <div className="card">
            <h3>Create New Project</h3>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Project Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>WordPress URL</label>
                    <input type="text" value={wp_url} onChange={(e) => setWpUrl(e.target.value)} placeholder="https://example.com" required />
                </div>
                <div className="form-group">
                    <label>WordPress User</label>
                    <input type="text" value={wp_user} onChange={(e) => setWpUser(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>WordPress Application Password</label>
                    <input type="password" value={wp_password} onChange={(e) => setWpPassword(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label>Posts per day (min-max)</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input type="number" value={min_posts_per_day} onChange={(e) => setMinPosts(parseInt(e.target.value))} style={{ width: '50px' }} min="1" />
                        <input type="number" value={max_posts_per_day} onChange={(e) => setMaxPosts(parseInt(e.target.value))} style={{ width: '50px' }} min="1" />
                    </div>
                </div>
                <button type="submit" className="btn btn-primary">Create Project</button>
            </form>
            {message && <p style={{marginTop: '1rem'}}>{message}</p>}
        </div>
    );
}

export default ProjectForm;