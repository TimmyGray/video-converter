'use client';

import * as React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#FF8C00',
      light: '#FFB74D',
      dark: '#E65100',
    },
    secondary: {
      main: '#FFB74D',
      light: '#FFD700',
      dark: '#FF8C00',
    },
    background: {
      default: '#0D0D0D',
      paper: '#1A1A2E',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#FFB74D',
    },
    error: {
      main: '#FF5252',
    },
    success: {
      main: '#69F0AE',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 800 },
    h2: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 16 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: ({ ownerState }: { ownerState: { variant?: string; color?: string } }) =>
          ownerState.variant === 'contained' && ownerState.color === 'primary'
            ? {
                background: 'linear-gradient(135deg, #FF8C00 0%, #FFB74D 100%)',
                boxShadow: '0 0 20px rgba(255, 140, 0, 0.5)',
                '&:hover': {
                  boxShadow: '0 0 35px rgba(255, 140, 0, 0.8)',
                  transform: 'translateY(-1px)',
                },
                transition: 'all 0.2s ease',
              }
            : {},
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(145deg, #1A1A2E 0%, #16213E 100%)',
          border: '1px solid rgba(255, 140, 0, 0.2)',
          boxShadow: '0 0 30px rgba(255, 140, 0, 0.1)',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          height: 10,
          backgroundColor: 'rgba(255,140,0,0.15)',
        },
        bar: {
          background: 'linear-gradient(90deg, #FF8C00, #FFD700)',
          boxShadow: '0 0 10px rgba(255,140,0,0.6)',
        },
      },
    },
  },
});

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
