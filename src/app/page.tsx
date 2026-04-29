import React from 'react';
import { Box, Container } from '@mui/material';
import ConverterCardDynamic from '@/components/ConverterCardDynamic';

export default function HomePage() {
  return (
    <Box
      className="gradient-bg"
      sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}
    >
      <Container
        maxWidth="lg"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          py: { xs: 1.5, sm: 2 },
        }}
      >
        <ConverterCardDynamic />
      </Container>
    </Box>
  );
}
