import React, { useState} from 'react';
import { useNavigate } from 'react-router-dom';

// This is a static list of players for now.
// In a real application, you would fetch this data from an API endpoint.
const initialPlayerList = [
  { name: 'JaMarr Chase', position: 'WR', rank: 1, isFavorite: false },
  { name: 'Bijan Robinson', position: 'RB', rank: 2, isFavorite: false },
  { name: 'CeeDee Lamb', position: 'WR', rank: 3, isFavorite: false },
  { name: 'Justin Jefferson', position: 'WR', rank: 4, isFavorite: false },
  { name: 'Jahmyr Gibbs', position: 'RB', rank: 5, isFavorite: false },
  { name: 'Puka Nacua', position: 'WR', rank: 6, isFavorite: false },
  { name: 'Malik Nabers', position: 'WR', rank: 7, isFavorite: false },
  { name: 'Amon-Ra St. Brown', position: 'WR', rank: 8, isFavorite: false },
  { name: 'Saquon Barkley', position: 'RB', rank: 9, isFavorite: false },
];

const Home = ({ userId }) => {
  const [players, setPlayers] = useState(initialPlayerList);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortPosition, setSortPosition] = useState('All Positions');
  const navigate = useNavigate();

  const filteredPlayers = players
    .filter(player => 
      player.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter(player =>
      sortPosition === 'All Positions' || player.position === sortPosition
    );

  const toggleFavorite = (playerToToggle) => {
    setPlayers(players.map(player => 
      player.name === playerToToggle.name 
        ? { ...player, isFavorite: !player.isFavorite }
        : player
    ));
  };
  
  // A hook to fetch data. Uncomment this in a real app.
  // useEffect(() => {
  //   const fetchPlayers = async () => {
  //     const response = await fetch('YOUR_API_ENDPOINT/players');
  //     const data = await response.json();
  //     setPlayers(data);
  //   };
  //   fetchPlayers();
  // }, []);

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Welcome, tyler.weltzin@gmail.com!</h1>
      <p>Get ready for your fantasy football auction draft!</p>
      <p>Your full User ID: {userId}</p>
      <button 
        onClick={() => navigate('/leagues')}
        style={{ padding: '10px 20px', fontSize: '18px', cursor: 'pointer' }}
      >
        Go to Leagues
      </button>

      <div style={{ marginTop: '40px' }}>
        <h2>Global Player Pool (Favorite Players Here!)</h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>Sort by Position:</span>
            <select onChange={(e) => setSortPosition(e.target.value)}>
              <option>All Positions</option>
              <option>WR</option>
              <option>RB</option>
              {/* Add more positions as needed */}
            </select>
          </div>
          <input
            type="text"
            placeholder="Search for a player..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '8px' }}
          />
        </div>
        
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 auto', maxWidth: '600px' }}>
          {filteredPlayers.map((player) => (
            <li 
              key={player.rank}
              style={{
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '10px', 
                border: '1px solid #ddd', 
                marginBottom: '5px'
              }}
            >
              <span>{player.name} ({player.position}) - Rank: {player.rank}</span>
              <span
                style={{ cursor: 'pointer', color: player.isFavorite ? 'gold' : 'grey' }}
                onClick={() => toggleFavorite(player)}
              >
                ★
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Home;