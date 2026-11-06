// The signed-in bidder's own labelled digits (profile.handwriting), for the auto-read recognizer.
// The server adds to them when the commissioner awards one of this user's boards in an auto-read league;
// they only ever leave the server for their owner's device.
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';

const REFRESH_MS = 2 * 60 * 1000;
let cache = { userId: null, at: 0, promise: null };

const hasExamples = (value) => Boolean(value) && typeof value === 'object'
  && Object.values(value).some((examples) => Array.isArray(examples) && examples.length > 0);

/** Fetches (at most every couple of minutes) the user's handwriting examples; null when there are none. */
export const loadPersonalHandwriting = (userId) => {
  if (!userId) return Promise.resolve(null);
  const fresh = cache.userId === userId && Date.now() - cache.at < REFRESH_MS;
  if (!fresh || !cache.promise) {
    cache = {
      userId,
      at: Date.now(),
      promise: axios.post(`${API_BASE_URL}/user-profile`, { userId })
        .then((response) => (hasExamples(response.data?.handwriting) ? response.data.handwriting : null))
        .catch(() => {
          cache.at = 0; // try again next time
          return null;
        }),
    };
  }
  return cache.promise;
};

/** The examples for `userId`, loaded once the pad is in auto-read. */
export const usePersonalHandwriting = (userId, enabled = true) => {
  const [handwriting, setHandwriting] = useState(null);
  useEffect(() => {
    if (!enabled || !userId) {
      setHandwriting(null);
      return undefined;
    }
    let live = true;
    loadPersonalHandwriting(userId).then((value) => {
      if (live) setHandwriting(value);
    });
    return () => { live = false; };
  }, [userId, enabled]);
  return handwriting;
};
