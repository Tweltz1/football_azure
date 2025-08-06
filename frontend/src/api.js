import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

export const getSignalRInfo = async () => {
    return axios.get(`${API_BASE_URL}/GetSignalRInfo`);
};

export const placeBid = async (leagueId, bidData) => {
    return axios.post(`${API_BASE_URL}/leagues/${leagueId}/bid`, bidData);
};