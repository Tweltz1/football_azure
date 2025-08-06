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
      <button>Join League</button>
      
      {leagues.length > 0 ? (
        <div>
          <h3>Your Active Leagues</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2' }}>
                <th style={{ padding: '10px', border: '1px solid #ddd' }}>League Name</th>
                <th style={{ padding: '10px', border: '1px solid #ddd' }}>Admin</th>
                <th style={{ padding: '10px', border: '1px solid #ddd' }}>Teams Joined</th>
                <th style={{ padding: '10px', border: '1px solid #ddd' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leagues.map(league => (
                <tr key={league.id}>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                    {league.name}
                    <br />
                    <span>Your Team: JROP (Edit Profile)</span>
                  </td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                    {league.adminId === userId ? "You (Admin)" : "Other"}
                  </td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                    {league.members.length}/12
                  </td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                    <Link to={`/leagues/${league.id}`}>
                      <button>View Details</button>
                    </Link>
                    {league.adminId === userId && (
                      <>
                        <button style={{ backgroundColor: 'orange', marginLeft: '5px' }}>Edit Roster</button>
                        <button style={{ backgroundColor: 'red', marginLeft: '5px' }}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>You are not a member of any leagues yet.</p>
      )}
    </div>
  );
};

export default Leagues;