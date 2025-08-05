import React from 'react';

const Login = () => {
  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>Welcome to Fantasy Football Auction</h1>
      <p>Please log in to continue.</p>
      <div style={{ marginTop: '20px' }}>
        <a href="/.auth/login/github" style={{ marginRight: '10px' }}>
          <button>Login with GitHub</button>
        </a>
        <a href="/.auth/login/google">
          <button>Login with Google</button>
        </a>
      </div>
    </div>
  );
};

export default Login;