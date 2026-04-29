import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CropSelector from '@/components/CropSelector';
import { CropSettings } from '@/types';

const baseCrop: CropSettings = {
  mode: 'none',
  custom: {
    width: '',
    height: '',
    x: '0',
    y: '0',
  },
};

describe('CropSelector', () => {
  it('renders all crop templates and keeps custom inputs mounted', () => {
    render(
      <CropSelector
        cropSettings={baseCrop}
        onCropModeChange={jest.fn()}
        onCustomCropChange={jest.fn()}
      />
    );

    ['none', '9-16', '16-9', '4-3', '3-4', 'custom'].forEach((id) => {
      expect(screen.getByTestId(`crop-template-${id}`)).toBeInTheDocument();
    });

    expect(screen.getByTestId('crop-custom-grid')).toBeInTheDocument();
    const widthInput = screen.getByTestId('crop-custom-width').querySelector('input');
    expect(widthInput).toBeTruthy();
    if (widthInput) {
      expect(widthInput).toBeDisabled();
    }
  });

  it('calls onCropModeChange when selecting a template', () => {
    const onCropModeChange = jest.fn();

    render(
      <CropSelector
        cropSettings={baseCrop}
        onCropModeChange={onCropModeChange}
        onCustomCropChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('crop-template-9-16'));
    expect(onCropModeChange).toHaveBeenCalledWith('9:16');
  });

  it('propagates manual custom input changes in custom mode', () => {
    const onCustomCropChange = jest.fn();

    render(
      <CropSelector
        cropSettings={{ ...baseCrop, mode: 'custom' }}
        onCropModeChange={jest.fn()}
        onCustomCropChange={onCustomCropChange}
      />
    );

    const widthInput = screen.getByTestId('crop-custom-width').querySelector('input');
    expect(widthInput).toBeTruthy();

    if (widthInput) {
      fireEvent.change(widthInput, { target: { value: '72' } });
    }

    expect(onCustomCropChange).toHaveBeenCalledWith('width', '72');
  });

  it('supports horizontal drag scrubbing for custom numeric fields', () => {
    const onCustomCropChange = jest.fn();

    render(
      <CropSelector
        cropSettings={{
          mode: 'custom',
          custom: { width: '50', height: '40', x: '10', y: '20' },
        }}
        onCropModeChange={jest.fn()}
        onCustomCropChange={onCustomCropChange}
      />
    );

    const widthInput = screen.getByTestId('crop-custom-width').querySelector('input');
    expect(widthInput).toBeTruthy();

    if (widthInput) {
      fireEvent.mouseDown(widthInput, { button: 0, clientX: 100 });
      fireEvent.mouseMove(window, { clientX: 116 });
      fireEvent.mouseUp(window);
    }

    expect(onCustomCropChange).toHaveBeenCalledWith('width', '54');
  });
});
