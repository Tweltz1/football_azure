import { Redirect } from 'expo-router';

// Google sign-in returns to totetrack://auth. The sign-in sheet normally catches it; if iOS opens
// the app with it instead, just go home.
export default function AuthReturn() {
  return <Redirect href="/" />;
}
