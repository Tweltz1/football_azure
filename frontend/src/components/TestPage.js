import { useEffect } from 'react';

// The Test tab opens Talk Shops (talkshops.app, built from talkshops/ in this repo), a stand-alone
// page that leaves the Hood League look entirely.
const DEMO_URL = 'https://talkshops.app/';

const TestPage = () => {
  useEffect(() => {
    window.location.replace(DEMO_URL);
  }, []);
  return null;
};

export default TestPage;
