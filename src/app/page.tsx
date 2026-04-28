import React from 'react';
import { Box, Container, Typography } from '@mui/material';
import Header from '@/components/Header';
import ConverterCardDynamic from '@/components/ConverterCardDynamic';

export default function HomePage() {
  return (
    <Box
      className="gradient-bg"
      sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <Header />
      <Container
        maxWidth="md"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          py: { xs: 3, sm: 6 },
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 800,
              background: 'linear-gradient(135deg, #FF8C00 0%, #FFD700 50%, #FF8C00 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 1,
              fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
            }}
          >
            Convert Any Video
          </Typography>
          <Typography
            variant="subtitle1"
            sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 480, mx: 'auto' }}
          >
            100% in-browser &bull; No uploads &bull; Powered by WebAssembly
          </Typography>
        </Box>

        <ConverterCardDynamic />
      </Container>
    </Box>
  );
}
