import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

export const getSignalRInfo = async (userId) => {
    const config = userId ? { params: { userId } } : undefined;
    return axios.get(`${API_BASE_URL}/GetSignalRInfo`, config);
};

export const placeBid = async (leagueId, bidData) => {
    return axios.post(`${API_BASE_URL}/leagues/${leagueId}/bid`, bidData);
};