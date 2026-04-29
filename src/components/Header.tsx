'use client';

import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';

export default function Header() {
  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        background: 'linear-gradient(90deg, #0D0D0D 0%, #1A1A2E 100%)',
        borderBottom: '1px solid rgba(255,140,0,0.3)',
        boxShadow: '0 2px 20px rgba(255,140,0,0.15)',
      }}
    >
      <Toolbar sx={{ justifyContent: 'center', minHeight: { xs: 64, sm: 70 } }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <VideoLibraryIcon
            sx={{
              color: '#FF8C00',
              fontSize: 36,
              filter: 'drop-shadow(0 0 8px rgba(255,140,0,0.7))',
            }}
          />
          <Typography
            variant="h5"
            component="span"
            sx={{
              fontWeight: 800,
              background: 'linear-gradient(90deg, #FF8C00, #FFD700)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px',
            }}
          >
            VideoForge
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
