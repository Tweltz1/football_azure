import { useEffect } from 'react';

// The Test tab opens a stand-alone page that simulates a repair shop's own app
// (shop board, check-in, customer view), so it leaves the Hood League look entirely.
const DEMO_URL = '/repair-shop-demo.html';

const TestPage = () => {
  useEffect(() => {
    window.location.replace(DEMO_URL);
  }, []);
  return null;
};

export default TestPage;
