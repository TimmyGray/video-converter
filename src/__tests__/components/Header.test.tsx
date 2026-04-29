import React from 'react';
import { render, screen } from '@testing-library/react';
import Header from '@/components/Header';

describe('Header', () => {
  it('renders the app name', () => {
    render(<Header />);
    expect(screen.getByText('VideoForge')).toBeInTheDocument();
  });

  it('does not render the legacy tagline', () => {
    render(<Header />);
    expect(screen.queryByText(/Browser-based video converter/i)).not.toBeInTheDocument();
  });
});
