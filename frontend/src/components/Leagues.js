import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import '../App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const Leagues = ({ userId }) => {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [currentLeague, setCurrentLeague] = useState(null);
  
  // States for Join League modal
  const [joinLeagueName, setJoinLeagueName] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  
  // States for Roster Settings from the pop-up
  const [rosterSettings, setRosterSettings] = useState({});
  const [draftTimers, setDraftTimers] = useState({});

  const fetchLeagues = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/GetLeagues?userId=${userId}`);
      setLeagues(response.data);
    } catch (error) {
      console.error("Error fetching leagues:", error);
      alert("Failed to fetch leagues.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchLeagues();
  }, [fetchLeagues]);

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

  const handleEditTeamName = async () => {
    try {
      await axios.post(`${API_BASE_URL}/leagues/${currentLeague.id}/teams`, {
        userId: userId,
        newTeamName: newTeamName
      });
      alert("Team name updated successfully!");
      setShowEditModal(false);
      fetchLeagues();
    } catch (error) {
      alert(`Failed to update team name: ${error.response?.data || error.message}`);
    }
  };

  const handleUpdateRosterSettings = async () => {
    try {
      await axios.post(`${API_BASE_URL}/leagues/${currentLeague.id}/settings`, {
        adminId: userId,
        rosterSettings: rosterSettings,
        draftTimers: draftTimers
      });
      alert("Roster settings updated successfully!");
      setShowRosterModal(false);
      fetchLeagues();
    } catch (error) {
      alert(`Failed to update settings: ${error.response?.data || error.message}`);
    }
  };
  
  const handleJoinLeague = async () => {
    try {
        const response = await axios.post(`${API_BASE_URL}/JoinLeague`, {
            userId: userId,
            leagueName: joinLeagueName,
            password: joinPassword
        });
        alert(`Successfully joined league '${response.data.name}'!`);
        setShowJoinModal(false);
        fetchLeagues();
    } catch (error) {
        alert(`Failed to join league: ${error.response?.data || error.message}`);
    }
  };

  if (loading) {
    return <div>Loading leagues...</div>;
  }

  return (
    <div>
      <h2>My Leagues</h2>
      <div className="button-group">
        <Link to="/create-league">
          <button className="create-button">Create a League</button>
        </Link>
        <button onClick={() => setShowJoinModal(true)} className="join-button">Join League</button>
      </div>
      
      {leagues.length > 0 ? (
        <div>
          <h3>Your Active Leagues</h3>
          <table className="leagues-table">
            <thead>
              <tr>
                <th>League Name</th>
                <th>Admin</th>
                <th>Teams Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leagues.map(league => (
                <tr key={league.id}>
                  <td>
                    {league.name}
                    <br />
                    <span>Your Team: {league.teams.find(t => t.ownerId === userId)?.name || 'N/A'} <button className="link-button" onClick={() => {
                        setShowEditModal(true);
                        setCurrentLeague(league);
                        setNewTeamName(league.teams.find(t => t.ownerId === userId)?.name || '');
                    }}>Edit Profile</button></span>
                  </td>
                  <td>
                    {league.adminId === userId ? "You (Admin)" : "Other"}
                  </td>
                  <td>
                    {league.members.length}/12
                  </td>
                  <td className="actions-cell-flex">
                    <Link to={`/leagues/${league.id}`}>
                      <button className="view-details-button">View Details</button>
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
                          className="edit-roster-button">
                          Edit Roster
                        </button>
                        <button 
                          onClick={() => handleDelete(league.id)} 
                          className="delete-button">
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
        <div className="modal-overlay">
          <div className="modal-content">
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
            <button onClick={() => setShowEditModal(false)} className="cancel-button">Cancel</button>
          </div>
        </div>
      )}

      {showRosterModal && currentLeague && (
        <div className="modal-overlay">
          <div className="modal-content">
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
              <button onClick={() => setShowRosterModal(false)} className="cancel-button" style={{ marginLeft: '10px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>Join a League</h3>
                <label>
                    League Name:
                    <input 
                        type="text" 
                        value={joinLeagueName} 
                        onChange={(e) => setJoinLeagueName(e.target.value)} 
                        required 
                    />
                </label>
                <br />
                <label>
                    Password (optional):
                    <input 
                        type="password" 
                        value={joinPassword} 
                        onChange={(e) => setJoinPassword(e.target.value)} 
                    />
                </label>
                <br />
                <button onClick={handleJoinLeague}>Join League</button>
                <button onClick={() => setShowJoinModal(false)} className="cancel-button" style={{ marginLeft: '10px' }}>Cancel</button>
            </div>
        </div>
      )}
    </div>
  );
};

export default Leagues;