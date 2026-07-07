import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FormatSelector from '@/components/FormatSelector';

const mockOnFormatChange = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('FormatSelector', () => {
  it('renders all 6 format chips', () => {
    render(
      <FormatSelector selectedFormat="mp4" onFormatChange={mockOnFormatChange} />
    );
    ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif'].forEach((fmt) => {
      expect(screen.getByTestId(`format-chip-${fmt}`)).toBeInTheDocument();
    });
  });

  it('calls onFormatChange when a chip is clicked', () => {
    render(
      <FormatSelector selectedFormat="mp4" onFormatChange={mockOnFormatChange} />
    );
    fireEvent.click(screen.getByTestId('format-chip-webm'));
    expect(mockOnFormatChange).toHaveBeenCalledWith('webm');
  });

  it('does not call onFormatChange when disabled', () => {
    render(
      <FormatSelector
        selectedFormat="mp4"
        onFormatChange={mockOnFormatChange}
        disabled
      />
    );
    fireEvent.click(screen.getByTestId('format-chip-avi'));
    expect(mockOnFormatChange).not.toHaveBeenCalled();
  });

  it('shows "Output Format" label', () => {
    render(
      <FormatSelector selectedFormat="mp4" onFormatChange={mockOnFormatChange} />
    );
    expect(screen.getByText(/Output Format/i)).toBeInTheDocument();
  });

  it('renders only MP3 when constrained to audio mode formats', () => {
    render(
      <FormatSelector
        selectedFormat="mp3"
        onFormatChange={mockOnFormatChange}
        formats={['mp3']}
      />
    );

    expect(screen.getByTestId('format-chip-mp3')).toBeInTheDocument();
    ['mp4', 'avi', 'mov', 'mkv', 'webm', 'gif'].forEach((fmt) => {
      expect(screen.queryByTestId(`format-chip-${fmt}`)).not.toBeInTheDocument();
    });
  });
});
