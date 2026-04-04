import { storageService } from '../../../services/storageService';

import { GetCachedMetadata, LoadLocalContinueWatchingResult } from './dataTypes';
import { ContinueWatchingItem } from './types';
import { findNextEpisode } from './dataShared';
import { isSupportedId, parseEpisodeId } from './utils';

interface LoadLocalContinueWatchingParams {
  getCachedMetadata: GetCachedMetadata;
  traktMoviesSetPromise: Promise<Set<string>>;
  traktShowsSetPromise: Promise<Set<string>>;
  localWatchedShowsMapPromise: Promise<Map<string, number>>;
}

export async function loadLocalContinueWatching({
  getCachedMetadata,
  traktMoviesSetPromise,
  traktShowsSetPromise,
  localWatchedShowsMapPromise,
}: LoadLocalContinueWatchingParams): Promise<LoadLocalContinueWatchingResult> {
  const allProgress = await storageService.getAllWatchProgress();
  if (Object.keys(allProgress).length === 0) {
    return { items: [], shouldClearItems: true };
  }

  const sortedProgress = Object.entries(allProgress)
    .sort(([, a], [, b]) => b.lastUpdated - a.lastUpdated)
    .slice(0, 30);

  const contentGroups: Record<
    string,
    {
      type: string;
      id: string;
      episodes: Array<{
        key: string;
        episodeId?: string;
        progress: any;
        progressPercent: number;
      }>;
    }
  > = {};

  for (const [key, progress] of sortedProgress) {
    const [type, id, ...episodeIdParts] = key.split(':');
    const episodeId = episodeIdParts.length > 0 ? episodeIdParts.join(':') : undefined;
    const progressPercent =
      progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : 0;

    if (
      type === 'movie' &&
      (progressPercent >= 85 || !isFinite(progressPercent) || progressPercent <= 0)
    ) {
      continue;
    }

    const contentKey = `${type}:${id}`;
    if (!contentGroups[contentKey]) {
      contentGroups[contentKey] = { type, id, episodes: [] };
    }

    contentGroups[contentKey].episodes.push({ key, episodeId, progress, progressPercent });
  }

  const batches = await Promise.all(
    Object.values(contentGroups).map(async (group) => {
      try {
        if (!isSupportedId(group.id)) return [];

        if (group.type === 'movie') {
          const watchedSet = await traktMoviesSetPromise;
          const imdbId = group.id.startsWith('tt') ? group.id : `tt${group.id}`;

          if (watchedSet.has(imdbId)) {
            try {
              const existingMovieProgress = group.episodes[0]?.progress;
              await storageService.setWatchProgress(
                group.id,
                'movie',
                {
                  currentTime: existingMovieProgress?.currentTime ?? 1,
                  duration: existingMovieProgress?.duration ?? 1,
                  lastUpdated: existingMovieProgress?.lastUpdated ?? Date.now(),
                  traktSynced: true,
                  traktProgress: 100,
                } as any,
                undefined,
                { preserveTimestamp: true }
              );
            } catch {}
            return [];
          }
        }

        const cachedData = await getCachedMetadata(
          group.type,
          group.id,
          group.episodes[0]?.progress?.addonId
        );
        if (!cachedData?.basicContent) return [];

        const { metadata, basicContent } = cachedData;
        const batch: ContinueWatchingItem[] = [];

        for (const episode of group.episodes) {
          const { episodeId, progress, progressPercent } = episode;

          if (group.type === 'series' && progressPercent >= 85) {
            const parsedEpisode = parseEpisodeId(episodeId);

            if (
              parsedEpisode?.season !== undefined &&
              parsedEpisode?.episode !== undefined &&
              metadata?.videos
            ) {
              const watchedEpisodesSet = await traktShowsSetPromise;
              const localWatchedMap = await localWatchedShowsMapPromise;
              const baseTimestamp =
                progress.currentTime === 1 && progress.duration === 1
                  ? 0
                  : progress.lastUpdated;

              const nextEpisodeResult = findNextEpisode(
                parsedEpisode.season,
                parsedEpisode.episode,
                metadata.videos,
                watchedEpisodesSet,
                group.id,
                localWatchedMap,
                baseTimestamp
              );

              if (nextEpisodeResult) {
                const nextEpisode = nextEpisodeResult.video;
                batch.push({
                  ...basicContent,
                  progress: 0,
                  lastUpdated: nextEpisodeResult.lastWatched,
                  season: nextEpisode.season,
                  episode: nextEpisode.episode,
                  episodeTitle: nextEpisode.title || `Episode ${nextEpisode.episode}`,
                  addonId: progress.addonId,
                } as ContinueWatchingItem);
              }
            }

            continue;
          }

          let season: number | undefined;
          let episodeNumber: number | undefined;
          let episodeTitle: string | undefined;
          let isWatchedOnTrakt = false;

          if (episodeId && group.type === 'series') {
            const parsedEpisode = parseEpisodeId(episodeId);
            season = parsedEpisode?.season;
            episodeNumber = parsedEpisode?.episode;

            if (episodeNumber !== undefined) {
              episodeTitle = `Episode ${episodeNumber}`;
            }

            if (season !== undefined && episodeNumber !== undefined) {
              const watchedEpisodesSet = await traktShowsSetPromise;
              const localWatchedMap = await localWatchedShowsMapPromise;
              const rawId = group.id.replace(/^tt/, '');
              const ttId = `tt${rawId}`;

              const signatures = [
                `${ttId}:${season}:${episodeNumber}`,
                `${rawId}:${season}:${episodeNumber}`,
                `${group.id}:${season}:${episodeNumber}`,
              ];

              isWatchedOnTrakt = signatures.some(
                (signature) =>
                  watchedEpisodesSet.has(signature) || localWatchedMap.has(signature)
              );

              if (isWatchedOnTrakt) {
                try {
                  await storageService.setWatchProgress(
                    group.id,
                    'series',
                    {
                      currentTime: progress.currentTime ?? 1,
                      duration: progress.duration ?? 1,
                      lastUpdated: progress.lastUpdated,
                      traktSynced: true,
                      traktProgress: 100,
                    } as any,
                    episodeId,
                    { preserveTimestamp: true }
                  );
                } catch {}
              }
            }
          }

          if (isWatchedOnTrakt) {
            continue;
          }

          batch.push({
            ...basicContent,
            progress: progressPercent,
            lastUpdated: progress.lastUpdated,
            season,
            episode: episodeNumber,
            episodeTitle,
            addonId: progress.addonId,
          } as ContinueWatchingItem);
        }

        return batch;
      } catch {
        return [];
      }
    })
  );

  return {
    items: batches.flat(),
    shouldClearItems: false,
  };
}
