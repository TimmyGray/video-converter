import React from 'react';
import { render, screen } from '@testing-library/react';
import TranscriptPanel from '@/components/TranscriptPanel';

describe('TranscriptPanel', () => {
  it('renders nothing when there is no text', () => {
    const { container } = render(<TranscriptPanel text={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the transcript text when present', () => {
    render(<TranscriptPanel text="Hello world" />);
    expect(screen.getByTestId('transcript-text')).toHaveTextContent('Hello world');
  });

  it('shows the transcribing indicator while streaming', () => {
    render(<TranscriptPanel text="Hello" streaming />);
    expect(screen.getByTestId('transcript-streaming-indicator')).toBeInTheDocument();
  });

  it('hides the transcribing indicator when not streaming', () => {
    render(<TranscriptPanel text="Hello world" />);
    expect(screen.queryByTestId('transcript-streaming-indicator')).not.toBeInTheDocument();
  });
});
