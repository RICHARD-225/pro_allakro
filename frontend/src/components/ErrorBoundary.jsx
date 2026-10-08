import { Component } from 'react';
import ErrorState from '@/components/ui/ErrorState';

// Empêche une erreur de rendu dans une page de vider toute l'application (page blanche)
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Erreur de rendu :', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Réinitialise l'erreur quand on change de page
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          message={`Cette page n'a pas pu s'afficher : ${this.state.error.message}`}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
