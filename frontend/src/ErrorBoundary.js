import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled app error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="loading-screen">
          <section className="loading-panel app-error-panel">
            <p className="section-kicker">Draft room interrupted</p>
            <h2>Something failed to load.</h2>
            <p>Refresh the page to reconnect to the draft room.</p>
            <button onClick={this.handleReload}>Refresh</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
