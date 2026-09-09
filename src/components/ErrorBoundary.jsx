import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Intentionally no console.log in production build — this is where
    // a real error-reporting call would go if one existed.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--ink-black)',
            color: 'var(--parchment)',
            padding: '24px',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          <h2 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--lantern-bright)' }}>
            Something tore in the page.
          </h2>
          <p style={{ color: 'var(--parchment-dim)', maxWidth: '48ch' }}>
            An unexpected error occurred. Try reloading — if this keeps happening, the
            underlying chain data may be temporarily unavailable.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              border: '1px solid var(--lantern-dim)',
              background: 'rgba(232, 169, 76, 0.12)',
              color: 'var(--lantern-bright)',
              padding: '12px 24px',
              borderRadius: '4px',
              fontSize: '0.95rem',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
