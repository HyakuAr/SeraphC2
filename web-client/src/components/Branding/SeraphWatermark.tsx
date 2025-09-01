import React from 'react';
import { Box, Typography } from '@mui/material';

const SeraphWatermark: React.FC = () => {
  return (
    <Box
      sx={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        opacity: 0.05,
        zIndex: -1,
        pointerEvents: 'none',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Seraphim Wings Symbol */}
      <Box
        sx={{
          fontSize: '15rem',
          lineHeight: 1,
          color: 'primary.main',
          fontFamily: 'serif',
          mb: 2,
        }}
      >
        ♦
      </Box>

      {/* SeraphC2 Text */}
      <Typography
        variant="h1"
        sx={{
          fontSize: '8rem',
          fontWeight: 'bold',
          color: 'primary.main',
          letterSpacing: '0.1em',
          textAlign: 'center',
        }}
      >
        SERAPH
      </Typography>

      <Typography
        variant="h2"
        sx={{
          fontSize: '4rem',
          fontWeight: 300,
          color: 'secondary.main',
          letterSpacing: '0.2em',
          textAlign: 'center',
          mt: -2,
        }}
      >
        C2
      </Typography>

      {/* Halo Effect */}
      <Box
        sx={{
          position: 'absolute',
          top: '-2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '20rem',
          height: '4rem',
          border: '3px solid',
          borderColor: 'secondary.main',
          borderRadius: '50%',
          opacity: 0.3,
        }}
      />
    </Box>
  );
};

export default SeraphWatermark;
