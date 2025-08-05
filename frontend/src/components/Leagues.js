import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const Leagues = ({ userId }) => {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/GetLeagues?userId=${userId}`);
        setLeagues(response.data);
      } catch (error) {
        console.error("Error fetching leagues:", error);
        alert("Failed to fetch leagues.");
      } finally {
        setLoading(false);
      }
    };
    fetchLeagues();
  }, [userId]);

  if (loading) {
    return <div>Loading leagues...</div>;
  }

  return (
    <div>
      <h2>My Leagues</h2>
      <Link to="/create-league">
        <button>Create a League</button>
      </Link>
      
      {leagues.length > 0 ? (
        <ul>
          {leagues.map(league => (
            <li key={league.id}>
              {league.name} - Status: {league.status}
            </li>
          ))}
        </ul>
      ) : (
        <p>You are not a member of any leagues yet.</p>
      )}
    </div>
  );
};

export default Leagues;