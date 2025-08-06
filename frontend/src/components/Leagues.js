import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const Leagues = ({ userId }) => {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [currentLeague, setCurrentLeague] = useState(null);
  
  // States for Roster Settings from the pop-up
  const [rosterSettings, setRosterSettings] = useState({});
  const [draftTimers, setDraftTimers] = useState({});

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

  useEffect(() => {
    fetchLeagues();
  }, [userId]);

  const handleDelete = async (leagueId) => {
    if (window.confirm("Are you sure you want to delete this league?")) {
      try {
        await axios.delete(`${API_BASE_URL}/leagues/${leagueId}`, { data: { adminId: userId } });
        alert("League deleted successfully!");
        fetchLeagues();
      } catch (error) {
        alert(`Failed to delete league: ${error.response?.data || error.message}`);
      }
    }
  };

  const handleUpdateRosterSettings = async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/leagues/${currentLeague.id}/settings`, {
        adminId: userId,
        rosterSettings: rosterSettings,
        draftTimers: draftTimers
      });
      alert("Roster settings updated successfully!");
      setShowRosterModal(false);
      fetchLeagues(); // Refresh the list of leagues
    } catch (error) {
      alert(`Failed to update settings: ${error.response?.data || error.message}`);
    }
  };

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
                    <span>Your Team: JROP (<button onClick={() => {
                        setShowEditModal(true);
                        setCurrentLeagueId(league.id);
                        setNewTeamName(league.teams.find(t => t.ownerId === userId)?.name || '');
                    }}>(Edit Profile)</button>)</span>
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
                        <button 
                          onClick={() => {
                            setShowRosterModal(true);
                            setCurrentLeague(league);
                            setRosterSettings(league.rosterSettings || {});
                            setDraftTimers(league.draftTimers || {});
                          }} 
                          style={{ backgroundColor: 'orange', marginLeft: '5px' }}>
                          Edit Roster
                        </button>
                        <button 
                          onClick={() => handleDelete(league.id)} 
                          style={{ backgroundColor: 'red', marginLeft: '5px' }}>
                          Delete
                        </button>
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
      
      {showEditModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '5px' }}>
            <h3>Edit Team Name</h3>
            <label>
              New Team Name:
              <input 
                type="text" 
                value={newTeamName} 
                onChange={(e) => setNewTeamName(e.target.value)} 
              />
            </label>
            <br />
            <button onClick={handleEditTeamName}>Save</button>
            <button onClick={() => setShowEditModal(false)} style={{ marginLeft: '10px' }}>Cancel</button>
          </div>
        </div>
      )}

      {showRosterModal && currentLeague && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '5px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', minWidth: '400px' }}>
            <h3 style={{ gridColumn: 'span 2' }}>Edit Roster Settings for {currentLeague.name}</h3>
            
            <label>QB:<input type="number" value={rosterSettings.qb || 0} onChange={(e) => setRosterSettings({...rosterSettings, qb: parseInt(e.target.value)})}/></label>
            <label>RB:<input type="number" value={rosterSettings.rb || 0} onChange={(e) => setRosterSettings({...rosterSettings, rb: parseInt(e.target.value)})}/></label>
            <label>WR:<input type="number" value={rosterSettings.wr || 0} onChange={(e) => setRosterSettings({...rosterSettings, wr: parseInt(e.target.value)})}/></label>
            <label>TE:<input type="number" value={rosterSettings.te || 0} onChange={(e) => setRosterSettings({...rosterSettings, te: parseInt(e.target.value)})}/></label>
            <label>DEF:<input type="number" value={rosterSettings.def || 0} onChange={(e) => setRosterSettings({...rosterSettings, def: parseInt(e.target.value)})}/></label>
            <label>K:<input type="number" value={rosterSettings.k || 0} onChange={(e) => setRosterSettings({...rosterSettings, k: parseInt(e.target.value)})}/></label>
            <label>FLEX:<input type="number" value={rosterSettings.flex || 0} onChange={(e) => setRosterSettings({...rosterSettings, flex: parseInt(e.target.value)})}/></label>
            <label>SUPERFLEX:<input type="number" value={rosterSettings.superFlex || 0} onChange={(e) => setRosterSettings({...rosterSettings, superFlex: parseInt(e.target.value)})}/></label>
            <label>BENCH:<input type="number" value={rosterSettings.bench || 0} onChange={(e) => setRosterSettings({...rosterSettings, bench: parseInt(e.target.value)})}/></label>
            
            <label>bidDuration:<input type="number" value={draftTimers.bidTimer || 0} onChange={(e) => setDraftTimers({...draftTimers, bidTimer: parseInt(e.target.value)})}/></label>
            <label>intermission:<input type="number" value={draftTimers.intermissionTimer || 0} onChange={(e) => setDraftTimers({...draftTimers, intermissionTimer: parseInt(e.target.value)})}/></label>
            <label>rebidDuration:<input type="number" value={draftTimers.rebidTimer || 0} onChange={(e) => setDraftTimers({...draftTimers, rebidTimer: parseInt(e.target.value)})}/></label>

            <div style={{ gridColumn: 'span 2', marginTop: '20px', textAlign: 'center' }}>
              <button onClick={handleUpdateRosterSettings}>Save Settings</button>
              <button onClick={() => setShowRosterModal(false)} style={{ marginLeft: '10px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leagues;