import { StreamingContent } from '../../../services/catalogService';

import { ContinueWatchingItem } from './types';

export interface CachedMetadataEntry {
  metadata: any;
  basicContent: StreamingContent | null;
  addonContent?: any;
  timestamp: number;
}

export interface LocalProgressEntry {
  episodeId?: string;
  season?: number;
  episode?: number;
  progressPercent: number;
  lastUpdated: number;
  currentTime: number;
  duration: number;
}

export type GetCachedMetadata = (
  type: string,
  id: string,
  addonId?: string
) => Promise<CachedMetadataEntry | null>;

export interface LoadLocalContinueWatchingResult {
  items: ContinueWatchingItem[];
  shouldClearItems: boolean;
}
