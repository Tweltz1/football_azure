import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

export const getSignalRInfo = async (userId) => {
    let resolvedUserId = userId;

    if (!resolvedUserId) {
        try {
            const authResponse = await axios.get('/.auth/me', { timeout: 10000 });
            resolvedUserId = authResponse.data?.clientPrincipal?.userId;
        } catch (error) {
            console.warn('Unable to resolve Static Web Apps user for SignalR token:', error);
        }
    }

    const config = resolvedUserId ? { params: { userId: resolvedUserId } } : undefined;
    return axios.get(`${API_BASE_URL}/GetSignalRInfo`, config);
};

export const placeBid = async (leagueId, bidData) => {
    return axios.post(`${API_BASE_URL}/leagues/${leagueId}/bid`, bidData);
};