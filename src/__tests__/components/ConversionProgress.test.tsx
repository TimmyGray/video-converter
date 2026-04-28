import React from 'react';
import { render, screen } from '@testing-library/react';
import ConversionProgress from '@/components/ConversionProgress';

describe('ConversionProgress', () => {
  it('renders nothing when status is idle', () => {
    const { container } = render(<ConversionProgress status="idle" progress={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when status is done', () => {
    const { container } = render(<ConversionProgress status="done" progress={100} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows loading spinner when status is loading', () => {
    render(<ConversionProgress status="loading" progress={0} />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText(/Loading FFmpeg engine/i)).toBeInTheDocument();
  });

  it('shows progress percentage when converting', () => {
    render(<ConversionProgress status="converting" progress={45} />);
    expect(screen.getByText(/45%/)).toBeInTheDocument();
  });

  it('shows progress bar for converting status', () => {
    render(<ConversionProgress status="converting" progress={60} />);
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
