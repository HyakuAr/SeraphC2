import React from 'react';
import { Box, Typography } from '@mui/material';

interface SeraphLogoProps {
  size?: 'small' | 'medium' | 'large';
  variant?: 'horizontal' | 'vertical';
}

const SeraphLogo: React.FC<SeraphLogoProps> = ({ size = 'medium', variant = 'horizontal' }) => {
  const sizeConfig = {
    small: {
      symbolSize: '1.5rem',
      titleSize: '1rem',
      subtitleSize: '0.75rem',
    },
    medium: {
      symbolSize: '2.5rem',
      titleSize: '1.5rem',
      subtitleSize: '1rem',
    },
    large: {
      symbolSize: '4rem',
      titleSize: '2.5rem',
      subtitleSize: '1.5rem',
    },
  };

  const config = sizeConfig[size];

  if (variant === 'vertical') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Seraphim Wings Symbol */}
        <Box
          sx={{
            fontSize: config.symbolSize,
            color: 'primary.main',
            fontFamily: 'serif',
            lineHeight: 1,
            mb: 0.5,
          }}
        >
          ♦
        </Box>

        <Typography
          variant="h6"
          sx={{
            fontSize: config.titleSize,
            fontWeight: 'bold',
            color: 'primary.main',
            letterSpacing: '0.1em',
            lineHeight: 1,
          }}
        >
          SERAPH
        </Typography>

        <Typography
          variant="subtitle1"
          sx={{
            fontSize: config.subtitleSize,
            fontWeight: 300,
            color: 'secondary.main',
            letterSpacing: '0.2em',
            lineHeight: 1,
          }}
        >
          C2
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      {/* Seraphim Wings Symbol */}
      <Box
        sx={{
          fontSize: config.symbolSize,
          color: 'primary.main',
          fontFamily: 'serif',
          lineHeight: 1,
        }}
      >
        ♦
      </Box>

      <Box>
        <Typography
          variant="h6"
          sx={{
            fontSize: config.titleSize,
            fontWeight: 'bold',
            color: 'primary.main',
            letterSpacing: '0.1em',
            lineHeight: 1,
          }}
        >
          SERAPH
          <Typography
            component="span"
            sx={{
              fontSize: config.subtitleSize,
              fontWeight: 300,
              color: 'secondary.main',
              letterSpacing: '0.2em',
              ml: 0.5,
            }}
          >
            C2
          </Typography>
        </Typography>
      </Box>
    </Box>
  );
};

export default SeraphLogo;
