import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { getDeviceType } from './utils';

export function useContinueWatchingLayout() {
  const { width } = useWindowDimensions();

  return useMemo(() => {
    const deviceType = getDeviceType(width);
    const isTablet = deviceType === 'tablet';
    const isLargeTablet = deviceType === 'largeTablet';
    const isTV = deviceType === 'tv';

    const computedItemWidth = (() => {
      switch (deviceType) {
        case 'tv':
          return 400;
        case 'largeTablet':
          return 350;
        case 'tablet':
          return 320;
        default:
          return 280;
      }
    })();

    const computedItemHeight = (() => {
      switch (deviceType) {
        case 'tv':
          return 160;
        case 'largeTablet':
          return 140;
        case 'tablet':
          return 130;
        default:
          return 120;
      }
    })();

    const horizontalPadding = (() => {
      switch (deviceType) {
        case 'tv':
          return 32;
        case 'largeTablet':
          return 28;
        case 'tablet':
          return 24;
        default:
          return 16;
      }
    })();

    const itemSpacing = (() => {
      switch (deviceType) {
        case 'tv':
          return 20;
        case 'largeTablet':
          return 18;
        case 'tablet':
          return 16;
        default:
          return 16;
      }
    })();

    const computedPosterWidth = (() => {
      switch (deviceType) {
        case 'tv':
          return 180;
        case 'largeTablet':
          return 160;
        case 'tablet':
          return 140;
        default:
          return 120;
      }
    })();

    return {
      deviceType,
      isTablet,
      isLargeTablet,
      isTV,
      horizontalPadding,
      itemSpacing,
      computedItemWidth,
      computedItemHeight,
      computedPosterWidth,
      computedPosterHeight: computedPosterWidth * 1.5,
    };
  }, [width]);
}
