import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import '../App.css';
import { HubConnectionBuilder } from '@microsoft/signalr';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const LeagueDetails = () => {
    const { leagueId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [league, setLeague] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isReady, setIsReady] = useState(false);
    const [favoritePlayers, setFavoritePlayers] = useState([]);
    const [availablePlayers, setAvailablePlayers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortPosition, setSortPosition] = useState('All Positions');
    const [hubConnection, setHubConnection] = useState(null);

    const fetchLeagueDetails = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/leagues/${leagueId}/details`);
            const allPlayers = response.data.initialPlayerPool || [];

            setLeague(response.data);
            setIsReady(response.data.readyMembers.includes(user.userId));
            setAvailablePlayers(allPlayers);
            setFavoritePlayers(allPlayers.filter(p => p.isFavorite));
        } catch (error) {
            console.error("Error fetching league details:", error);
            alert("Failed to fetch league details.");
            navigate('/leagues');
        } finally {
            setLoading(false);
        }
    }, [leagueId, user.userId, navigate]);

    useEffect(() => {
        fetchLeagueDetails();
    }, [fetchLeagueDetails]);

    // Corrected useEffect for SignalR
    useEffect(() => {
      const setupConnection = async () => {
        try {
          const info = await axios.get(`${API_BASE_URL}/GetSignalRInfo`);
          const newConnection = new HubConnectionBuilder()
              .withUrl(info.data.url, { accessTokenFactory: () => info.data.accessToken })
              .withAutomaticReconnect()
              .build();

          newConnection.on('readyStatusUpdate', (updatedLeague) => {
            setLeague(updatedLeague);
            setIsReady(updatedLeague.readyMembers.includes(user.userId));
          });
          
          await newConnection.start();
          setHubConnection(newConnection);
        } catch (e) {
          console.error('SignalR Connection Error: ', e);
        }
      };

      if (!hubConnection) {
        setupConnection();
      }

      return () => {
        if (hubConnection) hubConnection.stop();
      };
    }, [hubConnection, user.userId, leagueId]); // API_BASE_URL has been removed

    const handleSetReadyStatus = async () => {
        try {
            const newStatus = !isReady;
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/ready`, {
                userId: user.userId,
                isReady: newStatus
            });
        } catch (error) {
            alert(`Failed to update ready status: ${error.response?.data || error.message}`);
        }
    };

    const handleStartDraft = async () => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/startDraft`, {
                adminId: user.userId
            });
            alert("Draft starting soon!");
            navigate(`/draft/${leagueId}`);
        } catch (error) {
            alert(`Failed to start draft: ${error.response?.data || error.message}`);
        }
    };

    if (loading) {
        return <div>Loading league details...</div>;
    }

    if (!league) {
        return <div>League not found.</div>;
    }

    const isCurrentUserAdmin = league.adminId === user.userId;
    
    // Corrected logic: Check if all non-admin members are ready
    const allNonAdminsReady = (league.members.length > 1) ? 
        (league.readyMembers.length === (league.members.length - 1)) : 
        true;
    
    // Corrected logic: The canStartDraft is now based on this new logic
    const canStartDraft = isCurrentUserAdmin && allNonAdminsReady;

    // Fix: Corrected logic to use the variable to fix the error
    const userTeam = league.teams.find(team => team.ownerId === user.userId);
    const userTotalPlayersPicked = userTeam?.roster.filter(spot => spot.player).length || 0;
    const userTotalSpent = userTeam?.budget ? (200 - userTeam.budget) : 0;
    const remainingRosterSpots = (league.rosterSettings.qb + league.rosterSettings.rb + league.rosterSettings.wr + league.rosterSettings.te + league.rosterSettings.k + league.rosterSettings.def + league.rosterSettings.flex + league.rosterSettings.superFlex + league.rosterSettings.bench) - userTotalPlayersPicked;
    const userMaxBidForNextPlayer = userTeam?.budget ? Math.max(0, userTeam.budget - (remainingRosterSpots - 1)) : 0;
    
    const filteredAvailablePlayers = availablePlayers
      .filter(player => !player.isDrafted)
      .filter(player => player.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .filter(player => sortPosition === 'All Positions' || player.position === sortPosition);

    const filteredFavoritePlayers = favoritePlayers
      .filter(player => !player.isDrafted)
      .filter(player => player.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .filter(player => sortPosition === 'All Positions' || player.position === sortPosition);

    return (
        <div style={{ padding: '20px' }}>
            <h2>Drafting in {league.name}</h2>
            <p>League Status: {league.status.toUpperCase()}</p>

            <div className="card">
                <h3>Draft Controls & Overview</h3>
                {isCurrentUserAdmin ? (
                    <button
                        onClick={handleStartDraft}
                        className={`start-draft-button ${canStartDraft ? 'ready' : ''}`}
                        disabled={!canStartDraft}
                    >
                        Start Draft ({league.readyMembers.length}/{league.members.length - 1} Ready)
                    </button>
                ) : (
                    <button
                        onClick={handleSetReadyStatus}
                        className={`ready-button ${isReady ? 'ready' : ''}`}
                    >
                        {isReady ? "Waiting for Admin..." : "Ready up!"}
                    </button>
                )}
            </div>

            <div className="card" style={{ marginTop: '20px' }}>
                <h3>League Teams</h3>
                {league.teams.map(team => (
                    <div key={team.id} style={{ marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                        <p><strong>Team {team.name}</strong> ({team.ownerId === user.userId ? 'YOUR TEAM' : 'Other Team'})</p>
                        <p>Roster: {team.roster.filter(spot => spot.player).length} players</p>
                        {team.ownerId === user.userId && (
                            <>
                                <p>Budget: ${userTeam.budget}</p>
                                <p>Total Spent: ${userTotalSpent}</p>
                                <p>Max Bid for Next Player: ${userMaxBidForNextPlayer} (to fill all spots)</p>
                                <h4>Roster Spots:</h4>
                                <ul>
                                    <li>QB: {team.roster.filter(p => p.position === 'QB').length}/{league.rosterSettings.qb}</li>
                                    <li>RB: {team.roster.filter(p => p.position === 'RB').length}/{league.rosterSettings.rb}</li>
                                    <li>WR: {team.roster.filter(p => p.position === 'WR').length}/{league.rosterSettings.wr}</li>
                                    <li>TE: {team.roster.filter(p => p.position === 'TE').length}/{league.rosterSettings.te}</li>
                                    <li>DEF: {team.roster.filter(p => p.position === 'DEF').length}/{league.rosterSettings.def}</li>
                                    <li>K: {team.roster.filter(p => p.position === 'K').length}/{league.rosterSettings.k}</li>
                                    <li>FLEX: {team.roster.filter(p => p.position === 'FLEX').length}/{league.rosterSettings.flex}</li>
                                    <li>SUPERFLEX: {team.roster.filter(p => p.position === 'SUPERFLEX').length}/{league.rosterSettings.superFlex}</li>
                                    <li>BENCH: {team.roster.filter(p => p.position === 'BENCH').length}/{league.rosterSettings.bench}</li>
                                </ul>
                                <h4>Your Drafted Players:</h4>
                                {team.roster.filter(spot => spot.player).length > 0 ? (
                                    <ul>
                                        {team.roster.filter(spot => spot.player).map((spot, index) => (
                                            <li key={index}>{spot.player.name} ({spot.player.position}) - ${spot.player.price} (Assigned to {spot.position})</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p>No players drafted yet.</p>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </div>

            <div className="card" style={{ marginTop: '20px' }}>
                <h3>Your Favorited & Available Players (Collapse)</h3>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
                    <select onChange={(e) => setSortPosition(e.target.value)}>
                        <option>All Positions</option>
                        <option>QB</option>
                        <option>RB</option>
                        <option>WR</option>
                        <option>TE</option>
                        <option>K</option>
                        <option>DEF</option>
                        <option>FLEX</option>
                        <option>SUPERFLEX</option>
                        <option>BENCH</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Search for a player..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ padding: '8px' }}
                    />
                </div>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {filteredFavoritePlayers.length > 0 ? (
                        filteredFavoritePlayers.map(player => (
                            <li key={player.id} className="player-list-item">
                                <span>{player.name} ({player.position}) - Rank: {player.rank}</span>
                                <span style={{ color: 'red', cursor: 'pointer' }}>X</span>
                            </li>
                        ))
                    ) : (
                        <p>No favorited players available.</p>
                    )}
                </ul>
            </div>

            <div className="card" style={{ marginTop: '20px' }}>
                <h3>Available Players (Collapse)</h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {filteredAvailablePlayers.length > 0 ? (
                        filteredAvailablePlayers.map(player => (
                            <li key={player.id} className="player-list-item">
                                <span>{player.name} ({player.position}) - Rank: {player.rank}</span>
                                <span style={{ color: 'gold', cursor: 'pointer' }}>★</span>
                            </li>
                        ))
                    ) : (
                        <p>No available players.</p>
                    )}
                </ul>
            </div>
            
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button onClick={() => navigate('/leagues')} className="exit-draft-button">Exit Draft</button>
            </div>
        </div>
    );
};

export default LeagueDetails;
