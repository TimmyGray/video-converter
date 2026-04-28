'use client';

import dynamic from 'next/dynamic';

const ConverterCard = dynamic(() => import('./ConverterCard'), {
  ssr: false,
  loading: () => null,
});

export default ConverterCard;
