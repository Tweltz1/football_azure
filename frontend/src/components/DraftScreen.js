const AdminControls = ({ league, user, leagueId }) => {
    const [showBeerBitchModal, setShowBeerBitchModal] = useState(false);
    const [showNominateModal, setShowNominateModal] = useState(false);
    const [showManageMembersModal, setShowManageMembersModal] = useState(false);

    const handlePauseDraft = async () => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/pause`, { adminId: user.userId });
        } catch (error) {
            alert(`Error: ${error.response?.data || error.message}`);
        }
    };
    
    const handleSkipPlayer = async () => {
        if (window.confirm("Are you sure you want to skip this player?")) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/skip`, { adminId: user.userId });
            } catch (error) {
                alert(`Error skipping player: ${error.response?.data || error.message}`);
            }
        }
    };

    const handleAssignBeerBitch = async (teamId) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/beer-bitch`, { adminId: user.userId, teamId: teamId });
            setShowBeerBitchModal(false);
        } catch (error) {
            alert(`Error assigning beer duty: ${error.response?.data || error.message}`);
        }
    };

    const handleNominatePlayer = async (playerId) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/nominate`, { adminId: user.userId, playerId });
            setShowNominateModal(false);
        } catch (error) {
            alert(`Error nominating player: ${error.response?.data || error.message}`);
        }
    };

    const handleKickMember = async (teamIdToKick) => {
        const team = league.teams.find(t => t.id === teamIdToKick);
        if (window.confirm(`Are you sure you want to kick ${team.name}? This will return all their drafted players to the pool.`)) {
            try {
                await axios.post(`${API_BASE_URL}/leagues/${leagueId}/kick`, { adminId: user.userId, teamIdToKick });
            } catch (error) {
                alert(`Error kicking member: ${error.response?.data || error.message}`);
            }
        }
    };

    const handleAdjustBudget = async (teamId, newBudget) => {
        try {
            await axios.post(`${API_BASE_URL}/leagues/${leagueId}/adjust-budget`, { adminId: user.userId, teamId, newBudget: parseInt(newBudget) });
        } catch (error) {
            alert(`Error adjusting budget: ${error.response?.data || error.message}`);
        }
    };

    const isPaused = league.currentAuction?.auctionTimer?.isPaused;
    const isIntermission = league.currentAuction?.status === 'intermission';

    const pauseButtonText = () => {
        if (isIntermission) {
            return isPaused ? 'Resume Intermission' : 'Pause Intermission';
        }
        return isPaused ? 'Resume Draft' : 'Pause Draft';
    };

    return (
        <>
            <div>
                <button onClick={handlePauseDraft}>{pauseButtonText()}</button>
                <button onClick={handleSkipPlayer} disabled={isPaused || isIntermission}>Skip Player</button>
                <button onClick={() => setShowNominateModal(true)} disabled={!isPaused}>Nominate Player</button>
                <button onClick={() => setShowManageMembersModal(true)} disabled={!isPaused}>Manage Members</button>
                <button onClick={() => setShowBeerBitchModal(true)} disabled={!isPaused}>Beer B!tch</button>
                <button disabled={!isPaused}>Complete Draft</button>
            </div>

            {showBeerBitchModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Assign Beer B!tch</h3>
                        <p>Select a team to assign beer duty to.</p>
                        <ul style={{listStyle: 'none', padding: 0}}>
                            {league.teams.map(team => (
                                <li key={team.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #eee'}}>
                                    <span>{team.name}</span>
                                    {/* --- THIS IS THE CORRECTED LINE --- */}
                                    <button onClick={() => handleAssignBeerBitch(team.id)}>Assign</button>
                                </li>
                            ))}
                        </ul>
                        <button onClick={() => setShowBeerBitchModal(false)} className="cancel-button">Cancel</button>
                    </div>
                </div>
            )}
            
            {showNominateModal && (
                <NominatePlayerModal
                    league={league}
                    onNominate={handleNominatePlayer}
                    onClose={() => setShowNominateModal(false)}
                />
            )}

            {showManageMembersModal && (
                <ManageMembersModal
                    league={league}
                    onKick={handleKickMember}
                    onAdjustBudget={handleAdjustBudget}
                    onClose={() => setShowManageMembersModal(false)}
                />
            )}
        </>
    );
};