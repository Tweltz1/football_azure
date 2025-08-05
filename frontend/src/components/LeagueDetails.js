import React from 'react';
import { useParams } from 'react-router-dom';

const LeagueDetails = () => {
  const { leagueId } = useParams();
  return (
    <div>
      <h2>League Details for League ID: {leagueId}</h2>
      <p>This page will show details and settings for a specific league.</p>
    </div>
  );
};

export default LeagueDetails;