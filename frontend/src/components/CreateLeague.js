import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { useNavigate } from 'react-router-dom';
import BiddingStyleField from '../whiteboard/BiddingStyleField';
import { STANDARD, WHITEBOARD_AUTO, WHITEBOARD_MANUAL } from '../whiteboard/biddingStyle';
import { formatDuration } from '../data/leagueLabels';
import '../whiteboard/whiteboard.css';
import '../App.css';


const CreateLeague = ({ userId }) => {
  const [leagueName, setLeagueName] = useState('');
  const [password, setPassword] = useState('');
  const [draftMode, setDraftMode] = useState('auction');
  const [biddingMode, setBiddingMode] = useState(STANDARD);
  const navigate = useNavigate();
  const [rosterSettings, setRosterSettings] = useState({
    qb: 1, rb: 2, wr: 3, te: 1, k: 1, def: 1, flex: 1, superFlex: 1, bench: 6
  });
  const [draftTimers, setDraftTimers] = useState({
    bidTimer: 20, intermissionTimer: 30, rebidTimer: 15
  });

  const handleRosterChange = (e) => {
    const { name, value } = e.target;
    setRosterSettings(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
  };

  const handleTimerChange = (e) => {
    const { name, value } = e.target;
    setDraftTimers(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();

    try {
      const uniqueCheck = await axios.get(`${API_BASE_URL}/CheckLeagueName?leagueName=${leagueName}`);

      if (!uniqueCheck.data.isUnique) {
        alert(`A league with the name '${leagueName}' already exists.`);
        return;
      }

      const response = await axios.post(`${API_BASE_URL}/CreateLeague`, {
        name: leagueName,
        adminId: userId,
        password,
        draftMode,
        biddingMode: draftMode === 'manual' ? STANDARD : biddingMode,
        rosterSettings,
        draftTimers
      });

      alert(`League '${response.data.name}' created successfully!`);
      navigate('/leagues');
    } catch (error) {
      alert(`Failed to create league: ${error.response?.data || error.message}`);
    }
  };

  return (
    <div className="page-shell form-page">
      <section className="page-hero">
        <p className="page-kicker">Commissioner setup</p>
        <h1>Create League</h1>
        <p>Choose the room name, roster build, and clock speed before inviting the league in.</p>
        <div className="scoreboard-strip">
          <span>{formatDuration(draftTimers.bidTimer)} bid clock</span>
          <span>{formatDuration(draftTimers.intermissionTimer)} between players</span>
          <span>{draftMode === 'manual' ? 'Manual tracking' : biddingMode === WHITEBOARD_AUTO ? 'Whiteboard auction, auto-read' : biddingMode === WHITEBOARD_MANUAL ? 'Whiteboard auction' : 'Live auction'}</span>
          <span>{Object.values(rosterSettings).reduce((sum, value) => sum + value, 0)} roster spots</span>
        </div>
      </section>

      <section className="card">
        <form onSubmit={handleCreateLeague}>
          <p className="section-kicker">League identity</p>
          <div className="form-grid">
            <label>
              League Name
              <input type="text" value={leagueName} onChange={(e) => setLeagueName(e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </div>

          <div className="divider" />

          <p className="section-kicker">Draft mode</p>
          <div className="button-group" role="group" aria-label="Draft mode">
            <button
              type="button"
              className={draftMode === 'auction' ? 'create-button' : 'edit-roster-button'}
              onClick={() => setDraftMode('auction')}
            >
              Auction Draft
            </button>
            <button
              type="button"
              className={draftMode === 'manual' ? 'create-button' : 'edit-roster-button'}
              onClick={() => setDraftMode('manual')}
            >
              Manual Draft
            </button>
          </div>

          {draftMode === 'auction' && <BiddingStyleField value={biddingMode} onChange={setBiddingMode} />}

          <div className="divider" />

          <p className="section-kicker">Roster settings</p>
          <div className="settings-grid">
            <label>QB<input type="number" name="qb" value={rosterSettings.qb} onChange={handleRosterChange} /></label>
            <label>RB<input type="number" name="rb" value={rosterSettings.rb} onChange={handleRosterChange} /></label>
            <label>WR<input type="number" name="wr" value={rosterSettings.wr} onChange={handleRosterChange} /></label>
            <label>TE<input type="number" name="te" value={rosterSettings.te} onChange={handleRosterChange} /></label>
            <label>K<input type="number" name="k" value={rosterSettings.k} onChange={handleRosterChange} /></label>
            <label>DEF<input type="number" name="def" value={rosterSettings.def} onChange={handleRosterChange} /></label>
            <label>FLEX<input type="number" name="flex" value={rosterSettings.flex} onChange={handleRosterChange} /></label>
            <label>SUPERFLEX<input type="number" name="superFlex" value={rosterSettings.superFlex} onChange={handleRosterChange} /></label>
            <label>BENCH<input type="number" name="bench" value={rosterSettings.bench} onChange={handleRosterChange} /></label>
          </div>

          <div className="divider" />

          <p className="section-kicker">Draft timers (seconds)</p>
          <div className="settings-grid">
            <label>Bid Timer<input type="number" name="bidTimer" value={draftTimers.bidTimer} onChange={handleTimerChange} /></label>
            <label>Intermission<input type="number" name="intermissionTimer" value={draftTimers.intermissionTimer} onChange={handleTimerChange} /></label>
            <label>Re-bid Timer<input type="number" name="rebidTimer" value={draftTimers.rebidTimer} onChange={handleTimerChange} /></label>
          </div>

          <div className="form-actions" style={{ marginTop: '22px' }}>
            <button type="submit" className="create-button">Create League</button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default CreateLeague;
