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

            // Filter favorite players directly from the fetched data
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
    
    // New useEffect for SignalR
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
    }, [hubConnection, user.userId]);

    const handleSetReadyStatus = async () => {
        try {
            const newStatus = !isReady;
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/ready`, {
                userId: user.userId,
                isReady: newStatus
            });
            // The state will be updated by the SignalR message, so we don't need to manually update it here.
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
    const allMembersReady = league.readyMembers.length === league.members.length;
	const allNonAdminsReady = (league.members.length > 1) ? 
		(league.readyMembers.length === (league.members.length - 1)) && !league.readyMembers.includes(league.adminId) :
		true;
    const canStartDraft = isCurrentUserAdmin && allNonAdminsReady;;

    // Calculate user's team stats
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
            {/* ...rest of the component */}
        </div>
    );
};

export default LeagueDetails;