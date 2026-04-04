import { StreamingContent } from '../../../services/catalogService';

export interface ContinueWatchingItem extends StreamingContent {
  progress: number;
  lastUpdated: number;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  addonId?: string;
  addonPoster?: string;
  addonName?: string;
  addonDescription?: string;
  traktPlaybackId?: number;
}

export interface ContinueWatchingRef {
  refresh: () => Promise<boolean>;
}

export type ContinueWatchingDeviceType = 'phone' | 'tablet' | 'largeTablet' | 'tv';
