import React from 'react';
import { render, screen } from '@testing-library/react';
import CropPreviewPanel from '@/components/CropPreviewPanel';
import { CropSettings } from '@/types';

const defaultCrop: CropSettings = {
  mode: 'none',
  custom: {
    width: '',
    height: '',
    x: '0',
    y: '0',
  },
};

describe('CropPreviewPanel', () => {
  it('shows original frame label for none mode', () => {
    render(<CropPreviewPanel cropSettings={defaultCrop} hasFile={false} />);
    expect(screen.getByTestId('crop-preview-label')).toHaveTextContent('Original Frame');
  });

  it('shows ratio label for preset mode', () => {
    render(
      <CropPreviewPanel
        cropSettings={{ ...defaultCrop, mode: '9:16' }}
        hasFile
      />
    );
    expect(screen.getByTestId('crop-preview-label')).toHaveTextContent('Aspect 9:16');
  });

  it('shows custom dimensions when custom values are set', () => {
    render(
      <CropPreviewPanel
        cropSettings={{
          mode: 'custom',
          custom: { width: '50', height: '50', x: '10', y: '20' },
        }}
        hasFile
      />
    );
    expect(screen.getByTestId('crop-preview-label')).toHaveTextContent('Custom 50%×50%');
  });
});
