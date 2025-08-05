import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { getSignalRInfo, placeBid } from '../api';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const DraftScreen = ({ userId, isAdmin }) => {
    const { leagueId } = useParams();
    const [hubConnection, setHubConnection] = useState(null);
    const [draftState, setDraftState] = useState(null);
    const [bidAmount, setBidAmount] = useState(1);
    const [timer, setTimer] = useState(0);

    // This useEffect will be responsible for triggering the EndBiddingPhase function
    useEffect(() => {
        if (draftState?.status === 'drafting') {
            const intervalId = setInterval(async () => {
                try {
                    await axios.get(`${API_BASE_URL}/EndBiddingPhase?leagueId=${leagueId}`);
                } catch (error) {
                    console.error("Error calling EndBiddingPhase:", error);
                }
            }, 5000);

            return () => clearInterval(intervalId);
        }
    }, [draftState, leagueId]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const setupConnection = async () => {
            const info = await getSignalRInfo();
            const hubConnection = new HubConnectionBuilder()
                .withUrl(info.data.url, { accessTokenFactory: () => info.data.accessToken })
                .withAutomaticReconnect()
                .build();
            
            hubConnection.on('bidUpdate', (updateLeagueId, updateUserId, updateAmount) => {
                if (updateLeagueId === leagueId) {
                    console.log(`Bid received from user ${updateUserId}: $${updateAmount}`);
                }
            });

            hubConnection.on('draftWinnerAnnounced', (updateLeagueId, winningTeamName, winningAmount) => {
                if (updateLeagueId === leagueId) {
                    alert(`Winner! ${winningTeamName} with a bid of $${winningAmount}`);
                }
            });

            await hubConnection.start();
            setHubConnection(hubConnection);
        };

        setupConnection();
        return () => {
            if (hubConnection) hubConnection.stop();
        };
    }, [leagueId]);

    useEffect(() => {
        if (!draftState || draftState.status !== 'drafting') return;
        
        const interval = setInterval(() => {
            const remaining = Math.max(0, (new Date(draftState.auctionTimer.endTime).getTime() - Date.now()) / 1000);
            setTimer(remaining);
        }, 1000);

        return () => clearInterval(interval);
    }, [draftState]);

    const handlePlaceBid = async () => {
        try {
            await placeBid(leagueId, { userId, amount: parseInt(bidAmount) });
        } catch (error) {
            alert(`Error: ${error.response?.data || error.message}`);
        }
    };
    
    if (!draftState) return <div>Loading draft...</div>;

    return (
        <div>
            <h2>Draft Room - {draftState.name}</h2>
            {isAdmin && (
                <div>
                    <button>Pause/Resume Draft</button>
                    <button>Skip Player</button>
                </div>
            )}
            
            <div className="player-display">
                <h3>{draftState.currentPlayer.name}</h3>
                <p>Position: {draftState.currentPlayer.position}</p>
                <p>Bid ends in: {Math.floor(timer)} seconds</p>
            </div>
            
            <div className="bidding-controls">
                <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} />
                <button onClick={handlePlaceBid}>Place Bid</button>
            </div>
        </div>
    );
};

export default DraftScreen;