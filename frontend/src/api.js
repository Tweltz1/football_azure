import axios from 'axios';
import { SUPABASE_URL, supabase } from './supabaseClient';
import { rememberLeagues } from './realtime';

export const API_BASE_URL = process.env.REACT_APP_API_URL
    || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : 'http://localhost:54321/functions/v1/api');

const isApiRequest = (url) => typeof url === 'string' && url.startsWith(API_BASE_URL);

if (!axios.__hoodLeagueInterceptors) {
    // Sign every API call with the Supabase session; the server reads the user from this token.
    axios.interceptors.request.use(async (config) => {
        if (isApiRequest(config.url)) {
            const { data } = await supabase.auth.getSession();
            const token = data?.session?.access_token;
            config.headers = config.headers || {};
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    });

    axios.interceptors.response.use(
        (response) => {
            // Seeds the live-update cache so draft updates can be applied as small diffs.
            if (isApiRequest(response.config?.url)) {
                rememberLeagues(response.data);
            }
            return response;
        },
        (error) => {
            const url = error.config?.url || '';
            const isRegularBidPost = String(error.config?.method || '').toLowerCase() === 'post'
                && /\/leagues\/[^/]+\/bid$/.test(url);
            const shouldShowBidLimitAlert = isRegularBidPost
                && error.response?.status === 400
                && !error.config?.suppressBidLimitAlert;

            if (shouldShowBidLimitAlert) {
                alert(error.response?.data || 'That bid is above your current max bid.');
            }

            return Promise.reject(error);
        }
    );
    axios.__hoodLeagueInterceptors = true;
}

export const fetchLeagueState = (leagueId) => axios.get(`${API_BASE_URL}/leagues/${leagueId}/state`);

export const placeBid = async (leagueId, bidData) => {
    return axios.post(`${API_BASE_URL}/leagues/${leagueId}/bid`, bidData);
};
