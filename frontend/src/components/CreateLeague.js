import React, { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const CreateLeague = ({ userId }) => {
  const [leagueName, setLeagueName] = useState('');
  const [password, setPassword] = useState('');

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_BASE_URL}/CreateLeague`, {
        name: leagueName,
        adminId: userId,
        password: password
      });
      alert(`League '${response.data.name}' created successfully!`);
      // You might want to redirect to the new league's details page here
    } catch (error) {
      alert(`Failed to create league: ${error.response?.data || error.message}`);
    }
  };

  return (
    <div>
      <h3>Create a New League</h3>
      <form onSubmit={handleCreateLeague}>
        <label>
          League Name:
          <input 
            type="text" 
            value={leagueName} 
            onChange={(e) => setLeagueName(e.target.value)} 
            required 
          />
        </label>
        <br />
        <label>
          Password (optional):
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
          />
        </label>
        <br />
        <button type="submit">Create League</button>
      </form>
    </div>
  );
};

export default CreateLeague;