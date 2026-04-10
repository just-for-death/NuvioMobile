import { useCallback, useRef, useEffect } from 'react';
import { useTraktIntegration } from './useTraktIntegration';
import { useSimklIntegration } from './useSimklIntegration';
import { useTraktAutosyncSettings } from './useTraktAutosyncSettings';
import { TraktContentData } from '../services/traktService';
import { SimklContentData } from '../services/simklService';
import { storageService } from '../services/storageService';
import { logger } from '../utils/logger';

const TRAKT_SCROBBLE_THRESHOLD = 80;

interface TraktAutosyncOptions {
  id: string;
  type: 'movie' | 'series';
  title: string;
  year: number | string;
  imdbId: string;
  season?: number;
  episode?: number;
  showTitle?: string;
  showYear?: number | string;
  showImdbId?: string;
  episodeId?: string;
}

const recentlyScrobbledSessions = new Map<string, {
  scrobbledAt: number;
  progress: number;
}>();
const SCROBBLE_DEDUP_WINDOW_MS = 60 * 60 * 1000;

function getContentKey(opts: TraktAutosyncOptions): string {
  const resolvedId = (opts.imdbId && opts.imdbId.trim()) ? opts.imdbId : (opts.id || '');
  return opts.type === 'movie'
    ? `movie:${resolvedId}`
    : `episode:${opts.showImdbId || resolvedId}:${opts.season}:${opts.episode}`;
}

export function useTraktAutosync(options: TraktAutosyncOptions) {
  const {
    isAuthenticated,
    startWatching,
    stopWatching,
    stopWatchingImmediate
  } = useTraktIntegration();

  const {
    isAuthenticated: isSimklAuthenticated,
    startWatching: startSimkl,
    updateProgress: updateSimkl,
    stopWatching: stopSimkl
  } = useSimklIntegration();

  const { settings: autosyncSettings } = useTraktAutosyncSettings();

  // Session state refs
  const isSessionComplete = useRef(false); // True once scrobbled (>= 80%) — blocks ALL further payloads
  const isUnmounted = useRef(false);
  const lastSyncProgress = useRef(0);
  const sessionKey = useRef<string | null>(null);
  const unmountCount = useRef(0);
  const lastStopCall = useRef(0);

  // Initialise session on mount / content change
  useEffect(() => {
    const contentKey = getContentKey(options);
    sessionKey.current = `${contentKey}:${Date.now()}`;
    isUnmounted.current = false;
    unmountCount.current = 0;

    // Check if this content was recently scrobbled (prevents duplicate on remount)
    const prior = recentlyScrobbledSessions.get(contentKey);
    const now = Date.now();
    if (prior && (now - prior.scrobbledAt) < SCROBBLE_DEDUP_WINDOW_MS) {
      isSessionComplete.current = true;
      lastSyncProgress.current = prior.progress;
      logger.log(`[TraktAutosync] Remount detected — content already scrobbled (${prior.progress.toFixed(1)}%), blocking all payloads`);
    } else {
      isSessionComplete.current = false;
      lastSyncProgress.current = 0;
      lastStopCall.current = 0;
      if (prior) {
        recentlyScrobbledSessions.delete(contentKey);
      }
      logger.log(`[TraktAutosync] New session started for: ${sessionKey.current}`);
    }

    return () => {
      unmountCount.current++;
      isUnmounted.current = true;
      logger.log(`[TraktAutosync] Component unmount #${unmountCount.current} for: ${sessionKey.current}`);
    };
  }, [options.imdbId, options.season, options.episode, options.type]);

  // ── Build content data helpers ──────────────────────────────────────

  const buildContentData = useCallback((): TraktContentData | null => {
    const parseYear = (year: number | string | undefined): number | undefined => {
      if (year === undefined || year === null || year === '') return undefined;
      if (typeof year === 'number') {
        const currentYear = new Date().getFullYear();
        if (year < 1800 || year > currentYear + 10) return undefined;
        return year;
      }
      const parsed = parseInt(year.toString(), 10);
      if (isNaN(parsed) || parsed <= 0) return undefined;
      const currentYear = new Date().getFullYear();
      if (parsed < 1800 || parsed > currentYear + 10) return undefined;
      return parsed;
    };

    if (!options.title || options.title.trim() === '') {
      logger.error('[TraktAutosync] Cannot build content data: missing title');
      return null;
    }

    const imdbIdRaw = options.imdbId && options.imdbId.trim() ? options.imdbId.trim() : '';
    const stremioIdRaw = options.id && options.id.trim() ? options.id.trim() : '';
    const resolvedImdbId = imdbIdRaw || stremioIdRaw;

    if (!resolvedImdbId) {
      logger.error('[TraktAutosync] Cannot build content data: missing imdbId and id');
      return null;
    }

    const numericYear = parseYear(options.year);
    const numericShowYear = parseYear(options.showYear);

    if (options.type === 'movie') {
      return {
        type: 'movie',
        imdbId: resolvedImdbId,
        title: options.title.trim(),
        year: numericYear
      };
    } else {
      if (options.season === undefined || options.season === null || options.season < 0) {
        logger.error('[TraktAutosync] Cannot build episode content data: invalid season');
        return null;
      }
      if (options.episode === undefined || options.episode === null || options.episode < 0) {
        logger.error('[TraktAutosync] Cannot build episode content data: invalid episode');
        return null;
      }

      const resolvedShowImdbId = (options.showImdbId && options.showImdbId.trim())
        ? options.showImdbId.trim()
        : resolvedImdbId;

      return {
        type: 'episode',
        imdbId: resolvedImdbId,
        title: options.title.trim(),
        year: numericYear,
        season: options.season,
        episode: options.episode,
        showTitle: (options.showTitle || options.title).trim(),
        showYear: numericShowYear || numericYear,
        showImdbId: resolvedShowImdbId
      };
    }
  }, [options]);

  const buildSimklContentData = useCallback((): SimklContentData => {
    const resolvedId = (options.imdbId && options.imdbId.trim())
      ? options.imdbId.trim()
      : (options.id && options.id.trim()) ? options.id.trim() : '';
    return {
      type: options.type === 'series' ? 'episode' : 'movie',
      title: options.title,
      ids: { imdb: resolvedId },
      season: options.season,
      episode: options.episode
    };
  }, [options]);

  // ── /scrobble/start — play, unpause, seek ──────────────────────────

  const handlePlaybackStart = useCallback(async (currentTime: number, duration: number) => {
    console.log(`[TraktAutosync] START | time=${currentTime} dur=${duration} unmounted=${isUnmounted.current} complete=${isSessionComplete.current} traktAuth=${isAuthenticated} enabled=${autosyncSettings.enabled} simklAuth=${isSimklAuthenticated}`);
    if (isUnmounted.current) return;

    const shouldSyncTrakt = isAuthenticated && autosyncSettings.enabled;
    const shouldSyncSimkl = isSimklAuthenticated;

    if (!shouldSyncTrakt && !shouldSyncSimkl) return;

    // After scrobble (>= 80%), send NO more payloads
    if (isSessionComplete.current) {
      logger.log(`[TraktAutosync] Session complete — skipping /scrobble/start`);
      return;
    }

    if (duration <= 0) return;

    try {
      const rawProgress = (currentTime / duration) * 100;
      const progressPercent = Math.min(100, Math.max(0, rawProgress));

      // If we're already past 80%, don't send start — it's already scrobbled or will be
      if (progressPercent >= TRAKT_SCROBBLE_THRESHOLD) {
        logger.log(`[TraktAutosync] Progress ${progressPercent.toFixed(1)}% >= ${TRAKT_SCROBBLE_THRESHOLD}%, skipping start`);
        return;
      }

      const contentData = buildContentData();
      if (!contentData) return;

      if (shouldSyncTrakt) {
        const success = await startWatching(contentData, progressPercent);
        if (success) {
          lastSyncProgress.current = progressPercent;
          logger.log(`[TraktAutosync] /scrobble/start sent: ${contentData.title} at ${progressPercent.toFixed(1)}%`);
        }
      }

      if (shouldSyncSimkl) {
        const simklData = buildSimklContentData();
        await startSimkl(simklData, progressPercent);
      }
    } catch (error) {
      logger.error('[TraktAutosync] Error in handlePlaybackStart:', error);
    }
  }, [isAuthenticated, isSimklAuthenticated, autosyncSettings.enabled, startWatching, startSimkl, buildContentData, buildSimklContentData]);

  // ── /scrobble/stop — pause, close, unmount, video end ──────────────

  const handlePlaybackEnd = useCallback(async (currentTime: number, duration: number, reason: 'ended' | 'unmount' | 'user_close' = 'ended') => {
    console.log(`[TraktAutosync] STOP | time=${currentTime} dur=${duration} reason=${reason} unmounted=${isUnmounted.current} complete=${isSessionComplete.current} traktAuth=${isAuthenticated} enabled=${autosyncSettings.enabled}`);
    if (isUnmounted.current && reason !== 'unmount') return;

    const now = Date.now();
    const shouldSyncTrakt = isAuthenticated && autosyncSettings.enabled;
    const shouldSyncSimkl = isSimklAuthenticated;

    if (!shouldSyncTrakt && !shouldSyncSimkl) return;

    // After scrobble (>= 80%), send NO more payloads — prevents duplicate entries
    if (isSessionComplete.current) {
      logger.log(`[TraktAutosync] Session complete — skipping /scrobble/stop (reason: ${reason})`);
      return;
    }

    // Debounce: prevent duplicate stop calls within 500ms
    if (now - lastStopCall.current < 500) {
      logger.log(`[TraktAutosync] Ignoring duplicate stop call within 500ms (reason: ${reason})`);
      return;
    }

    // Skip duplicate unmount calls (React strict mode)
    if (reason === 'unmount' && unmountCount.current > 1) return;

    try {
      let progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
      progressPercent = Math.min(100, Math.max(0, progressPercent));

      // For unmount, use highest known progress
      if (reason === 'unmount') {
        if (lastSyncProgress.current > progressPercent) {
          progressPercent = lastSyncProgress.current;
        }
        try {
          const savedProgress = await storageService.getWatchProgress(options.id, options.type, options.episodeId);
          if (savedProgress && savedProgress.duration > 0) {
            const savedPercent = Math.min(100, Math.max(0, (savedProgress.currentTime / savedProgress.duration) * 100));
            if (savedPercent > progressPercent) progressPercent = savedPercent;
          }
        } catch {}
      }

      // Trakt ignores progress < 1% (returns 422)
      if (progressPercent < 1) {
        logger.log(`[TraktAutosync] Progress ${progressPercent.toFixed(1)}% < 1%, skipping stop`);
        return;
      }

      lastStopCall.current = now;
      lastSyncProgress.current = progressPercent;

      const contentData = buildContentData();
      if (!contentData) return;

      // Send /scrobble/stop to Trakt
      // Trakt API: >= 80% → scrobble (marks watched), 1-79% → pause (saves progress)
      let traktSuccess = false;
      if (shouldSyncTrakt) {
        const useImmediate = reason === 'user_close';
        traktSuccess = useImmediate
          ? await stopWatchingImmediate(contentData, progressPercent)
          : await stopWatching(contentData, progressPercent);

        if (traktSuccess) {
          logger.log(`[TraktAutosync] /scrobble/stop sent: ${contentData.title} at ${progressPercent.toFixed(1)}% (${reason})`);

          await storageService.updateTraktSyncStatus(
            options.id, options.type, true, progressPercent, options.episodeId, currentTime
          );

          // If >= 80%, Trakt has scrobbled it — mark session complete, no more payloads
          if (progressPercent >= TRAKT_SCROBBLE_THRESHOLD) {
            isSessionComplete.current = true;
            recentlyScrobbledSessions.set(getContentKey(options), {
              scrobbledAt: now,
              progress: progressPercent
            });
            logger.log(`[TraktAutosync] Scrobbled at ${progressPercent.toFixed(1)}% — session complete, no more payloads`);

            // Update local storage to reflect watched status
            try {
              if (duration > 0) {
                await storageService.setWatchProgress(
                  options.id, options.type,
                  {
                    currentTime: duration,
                    duration,
                    lastUpdated: Date.now(),
                    traktSynced: true,
                    traktProgress: Math.max(progressPercent, 100),
                    simklSynced: shouldSyncSimkl ? true : undefined,
                    simklProgress: shouldSyncSimkl ? Math.max(progressPercent, 100) : undefined,
                  } as any,
                  options.episodeId,
                  { forceNotify: true }
                );
              }
            } catch {}
          }
        } else {
          logger.warn(`[TraktAutosync] Failed to send /scrobble/stop`);
        }
      }

      // Simkl Stop
      if (shouldSyncSimkl) {
        const simklData = buildSimklContentData();
        await stopSimkl(simklData, progressPercent);
        await storageService.updateSimklSyncStatus(
          options.id, options.type, true, progressPercent, options.episodeId
        );
        logger.log(`[TraktAutosync] Simkl stop sent: ${simklData.title} at ${progressPercent.toFixed(1)}%`);
      }
    } catch (error) {
      logger.error('[TraktAutosync] Error in handlePlaybackEnd:', error);
    }
  }, [isAuthenticated, isSimklAuthenticated, autosyncSettings.enabled, stopWatching, stopSimkl, stopWatchingImmediate, buildContentData, buildSimklContentData, options]);

  // handleProgressUpdate — kept for Simkl compatibility only.
  // Trakt does NOT need periodic progress updates; only start/stop events.
  const handleProgressUpdate = useCallback(async (
    currentTime: number,
    duration: number,
    _force: boolean = false
  ) => {
    if (isUnmounted.current || duration <= 0) return;
    if (isSessionComplete.current) return;

    // Only update Simkl if authenticated — Trakt needs no periodic updates
    if (isSimklAuthenticated) {
      try {
        const rawProgress = (currentTime / duration) * 100;
        const progressPercent = Math.min(100, Math.max(0, rawProgress));
        const simklData = buildSimklContentData();
        await updateSimkl(simklData, progressPercent);
      } catch (error) {
        logger.error('[TraktAutosync] Error updating Simkl progress:', error);
      }
    }
  }, [isSimklAuthenticated, updateSimkl, buildSimklContentData]);

  const resetState = useCallback(() => {
    isSessionComplete.current = false;
    isUnmounted.current = false;
    lastSyncProgress.current = 0;
    unmountCount.current = 0;
    sessionKey.current = null;
    lastStopCall.current = 0;
    recentlyScrobbledSessions.delete(getContentKey(options));
    logger.log(`[TraktAutosync] Manual state reset for: ${options.title}`);
  }, [options.title]);

  return {
    isAuthenticated,
    handlePlaybackStart,
    handleProgressUpdate,
    handlePlaybackEnd,
    resetState
  };
}
