import { BREAKPOINTS } from './constants';
import { ContinueWatchingDeviceType, ContinueWatchingItem } from './types';

export const isSupportedId = (id: string): boolean => typeof id === 'string' && id.length > 0;

export const isEpisodeReleased = (video: any): boolean => {
  if (!video?.released) return false;

  try {
    return new Date(video.released) <= new Date();
  } catch {
    return false;
  }
};

export const getDeviceType = (deviceWidth: number): ContinueWatchingDeviceType => {
  if (deviceWidth >= BREAKPOINTS.tv) return 'tv';
  if (deviceWidth >= BREAKPOINTS.largeTablet) return 'largeTablet';
  if (deviceWidth >= BREAKPOINTS.tablet) return 'tablet';
  return 'phone';
};

export const buildEpisodeId = (
  item: Pick<ContinueWatchingItem, 'id' | 'type' | 'season' | 'episode'>
): string | undefined => {
  if (item.type !== 'series' || !item.season || !item.episode) {
    return undefined;
  }

  return `${item.id}:${item.season}:${item.episode}`;
};

export const getContinueWatchingItemKey = (
  item: Pick<ContinueWatchingItem, 'id' | 'type' | 'season' | 'episode'>
): string => {
  const episodeId = buildEpisodeId(item);
  return episodeId ? `${item.type}:${episodeId}` : `${item.type}:${item.id}`;
};

export const getContinueWatchingRemoveId = (
  item: Pick<ContinueWatchingItem, 'id' | 'type' | 'season' | 'episode'>
): string => buildEpisodeId(item) ?? item.id;

export const compareContinueWatchingItems = (
  a: ContinueWatchingItem,
  b: ContinueWatchingItem
): number => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0);

export const shouldPreferContinueWatchingCandidate = (
  candidate: ContinueWatchingItem,
  existing: ContinueWatchingItem
): boolean => {
  const candidateUpdated = candidate.lastUpdated ?? 0;
  const existingUpdated = existing.lastUpdated ?? 0;
  const candidateProgress = candidate.progress ?? 0;
  const existingProgress = existing.progress ?? 0;

  const sameEpisode =
    candidate.type === 'movie' ||
    (
      candidate.type === 'series' &&
      existing.type === 'series' &&
      candidate.season !== undefined &&
      candidate.episode !== undefined &&
      existing.season !== undefined &&
      existing.episode !== undefined &&
      candidate.season === existing.season &&
      candidate.episode === existing.episode
    );

  if (sameEpisode) {
    if (candidateProgress > existingProgress + 0.5) return true;
    if (existingProgress > candidateProgress + 0.5) return false;
  }

  if (candidateUpdated !== existingUpdated) {
    return candidateUpdated > existingUpdated;
  }

  return candidateProgress > existingProgress;
};

export const getIdVariants = (id: string): string[] => {
  const variants = new Set<string>();
  if (typeof id !== 'string' || id.length === 0) return [];

  variants.add(id);

  if (id.startsWith('tt')) {
    variants.add(id.replace(/^tt/, ''));
  } else if (/^\d+$/.test(id)) {
    variants.add(`tt${id}`);
  }

  return Array.from(variants);
};

export const parseEpisodeId = (episodeId?: string): { season: number; episode: number } | null => {
  if (!episodeId) return null;

  const match = episodeId.match(/s(\d+)e(\d+)/i);
  if (match) {
    const season = parseInt(match[1], 10);
    const episode = parseInt(match[2], 10);
    if (!isNaN(season) && !isNaN(episode)) {
      return { season, episode };
    }
  }

  const parts = episodeId.split(':');
  if (parts.length >= 3) {
    const season = parseInt(parts[parts.length - 2], 10);
    const episode = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(season) && !isNaN(episode)) {
      return { season, episode };
    }
  }

  return null;
};

export const toYearNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (isFinite(parsed)) return parsed;
  }
  return undefined;
};
