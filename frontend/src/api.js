import axios from 'axios';
import { SUPABASE_URL, supabase } from './supabaseClient';
import { acceptLeagues } from './realtime';
import { isOfflineLeague, offlineLeagueIds, saveProfileCopy, savedProfileEntry } from './offline/storage';
import { inApp } from './native/authSession';
import { localLeagueList, offlineUserIdFor, runLocal } from './offline/localApi';
import { loadRead, readKey, saveRead } from './offline/readCache';

export const API_BASE_URL = process.env.REACT_APP_API_URL
    || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : 'http://localhost:54321/functions/v1/api');

const isApiRequest = (url) => typeof url === 'string' && url.startsWith(API_BASE_URL);

// ---- Offline drafts -------------------------------------------------------------
// A league saved to this device is answered here instead of over the network, until it is uploaded.

// These two always go to the server: they move a league onto and off the device.
const SERVER_ONLY_ACTIONS = new Set(['offline-copy', 'offline-restore']);

const apiPath = (config) => {
    const [path, search = ''] = config.url.slice(API_BASE_URL.length).replace(/^\/+/, '').split('?');
    const query = new URLSearchParams(search);
    Object.entries(config.params || {}).forEach(([key, value]) => query.set(key, value));
    return { path, query };
};

const offlineLeagueOf = (path) => {
    const match = /^leagues\/([^/]+)(?:\/(.*))?$/.exec(path);
    if (!match || SERVER_ONLY_ACTIONS.has(match[2])) return null;
    const leagueId = decodeURIComponent(match[1]);
    return isOfflineLeague(leagueId) ? leagueId : null;
};

const toResponse = (config, status, data, headers = {}) => {
    const response = { data: data ?? '', status, statusText: String(status), headers, config, request: null };
    if (status >= 200 && status < 300) return response;
    const error = new Error(`Request failed with status code ${status}`);
    Object.assign(error, { config, response, isAxiosError: true, toJSON: () => ({ message: error.message, status }) });
    throw error;
};

const localAdapter = (leagueId) => async (config) => {
    const { path, query } = apiPath(config);
    let body = config.data;
    try {
        if (typeof body === 'string') body = JSON.parse(body);
    } catch (error) {
        body = undefined;
    }
    let result;
    try {
        result = await runLocal(config.method || 'get', path, query, body, offlineUserIdFor(leagueId));
    } catch (error) {
        result = { status: 503, body: error?.message || 'That is not available offline.' };
    }
    return toResponse(config, result.status, result.body, result.headers);
};

// The league list shows each saved league as this device has it, and only those when there's no internet.
const networkAdapter = (config) => axios.defaults.adapter(config);
const leagueListAdapter = async (config) => {
    const userId = offlineUserIdFor(offlineLeagueIds()[0]);
    const local = await localLeagueList(userId).catch(() => []);
    try {
        const response = await networkAdapter(config);
        const online = Array.isArray(response.data) ? response.data : JSON.parse(response.data || '[]');
        const byId = new Map(local.map((league) => [league.id, league]));
        const merged = online.map((league) => byId.get(league.id) || league);
        local.forEach((league) => { if (!merged.some((l) => l.id === league.id)) merged.push(league); });
        return { ...response, data: merged };
    } catch (error) {
        // A guest (no account) gets a 401 from the site; they only have this phone's leagues anyway.
        if (error?.response && error.response.status !== 401) throw error;
        return toResponse(config, 200, local);
    }
};

const routeOffline = (config) => {
    if (!offlineLeagueIds().length) return config;
    const { path } = apiPath(config);
    const leagueId = offlineLeagueOf(path);
    if (leagueId) return { ...config, adapter: localAdapter(leagueId), offlineLocal: true };
    if (path.toLowerCase() === 'getleagues' && String(config.method || 'get').toLowerCase() === 'get') {
        return { ...config, adapter: leagueListAdapter };
    }
    return config;
};

// With no internet a sign-in refresh retries for about 30 seconds. When drafts are saved on this device,
// stop waiting after a few seconds so the league list can fall back to them.
const sessionFor = (config) => {
    // With no internet, don't wait on a sign-in refresh: the request fails fast and a saved copy is used.
    if (navigator.onLine === false) return { data: null };
    if (!offlineLeagueIds().length) return supabase.auth.getSession();
    if (navigator.onLine === false && config.adapter === leagueListAdapter) return { data: null };
    const session = supabase.auth.getSession();
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ data: null }), 4000));
    return Promise.race([session, timeout]);
};

const requestBody = (config) => {
    if (!config?.data) return {};
    if (typeof config.data === 'object') return config.data;
    try { return JSON.parse(config.data) || {}; } catch (error) { return {}; }
};

if (!axios.__hoodLeagueInterceptors) {
    // Sign every API call with the Supabase session; the server reads the user from this token.
    axios.interceptors.request.use(async (config) => {
        if (isApiRequest(config.url)) {
            config = routeOffline(config);
            if (config.offlineLocal) return config;
            // Profile changes say where they came from, so the profile page can show "last saved from".
            if (inApp() && String(config.method).toLowerCase() === 'post' && config.data && typeof config.data === 'object'
                && /^(user-profile\/[^/]+|leagues\/[^/]+\/favorites)$/.test(apiPath(config).path)) {
                config = { ...config, data: { ...config.data, savedFrom: 'app' } };
            }
            const { data } = await sessionFor(config);
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
                acceptLeagues(response.data);
                if (!response.config.offlineLocal && !response.config.fromSavedCopy) {
                    const { path, query } = apiPath(response.config);
                    saveRead(readKey(response.config.method, path, query), response.data);
                    if (path === 'user-profile' || /^user-profile\/[^/]+$/.test(path)) {
                        const body = requestBody(response.config);
                        saveProfileCopy({ userId: response.data?.userId || body.userId, userDetails: response.data?.displayName || body.displayName }, response.data);
                    }
                }
            }
            return response;
        },
        (error) => {
            // No internet (no response at all): open the page with the last copy this phone saw.
            if (!error.response && error.config && isApiRequest(error.config.url) && !error.config.offlineLocal) {
                const { path, query } = apiPath(error.config);
                // A profile comes from this account's own saved copy, so it's never someone else's.
                const ownProfile = path === 'user-profile' ? savedProfileEntry(requestBody(error.config).userId) : null;
                const saved = ownProfile ? { data: ownProfile.profile, savedAt: ownProfile.savedAt } : loadRead(readKey(error.config.method, path, query));
                if (saved) {
                    return {
                        data: saved.data,
                        status: 200,
                        statusText: 'OK (saved copy)',
                        headers: { 'x-hl-saved-at': String(saved.savedAt) },
                        config: { ...error.config, fromSavedCopy: true },
                        request: null,
                    };
                }
            }
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
