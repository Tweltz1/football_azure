import { useEffect } from 'react';

// The Test tab opens Bay Status, the repair shop app at /shop/ (frontend/public/shop/), a stand-alone
// page that leaves the Hood League look entirely.
const DEMO_URL = '/shop/';

const TestPage = () => {
  useEffect(() => {
    window.location.replace(DEMO_URL);
  }, []);
  return null;
};

export default TestPage;
