import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const CreateLeague = ({ userId }) => {
  const [leagueName, setLeagueName] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleCreateLeague = async (e) => {
    e.preventDefault();

    try {
      // Step 1: Check if the league name is unique
      const uniqueCheck = await axios.get(`${API_BASE_URL}/CheckLeagueName?leagueName=${leagueName}`);
      
      if (!uniqueCheck.data.isUnique) {
        alert(`A league with the name '${leagueName}' already exists.`);
        return;
      }

      // Step 2: Create the league if the name is unique
      const response = await axios.post(`${API_BASE_URL}/CreateLeague`, {
        name: leagueName,
        adminId: userId,
        password: password
      });
      alert(`League '${response.data.name}' created successfully!`);
      navigate('/leagues'); // Redirect to the leagues page
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