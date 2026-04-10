import axios from 'axios';

import { mmkvStorage } from '../mmkvStorage';
import { localScraperService } from '../pluginService';
import { DEFAULT_SETTINGS, type AppSettings } from '../../hooks/useSettings';
import { TMDBService } from '../tmdbService';
import { logger } from '../../utils/logger';
import { safeAxiosConfig } from '../../utils/axiosConfig';

import type { StremioServiceContext } from './context';
import type { Manifest, ResourceObject, StreamCallback } from './types';

function pickStreamAddons(ctx: StremioServiceContext, requestType: string, id: string): Manifest[] {
  return ctx.getInstalledAddons().filter(addon => {
    if (!Array.isArray(addon.resources)) {
      logger.log(`⚠️ [getStreams] Addon ${addon.id} has no valid resources array`);
      return false;
    }

    let hasStreamResource = false;
    let supportsIdPrefix = false;

    for (const resource of addon.resources) {
      if (typeof resource === 'object' && resource !== null && 'name' in resource) {
        const typedResource = resource as ResourceObject;
        if (typedResource.name === 'stream' && typedResource.types?.includes(requestType)) {
          hasStreamResource = true;
          supportsIdPrefix =
            !typedResource.idPrefixes?.length ||
            typedResource.idPrefixes.some(prefix => id.startsWith(prefix));
          break;
        }
      } else if (resource === 'stream' && addon.types?.includes(requestType)) {
        hasStreamResource = true;
        supportsIdPrefix =
          !addon.idPrefixes?.length || addon.idPrefixes.some(prefix => id.startsWith(prefix));
        break;
      }
    }

    return hasStreamResource && supportsIdPrefix;
  });
}

async function runLocalScrapers(
  type: string,
  id: string,
  callback?: StreamCallback
): Promise<void> {
  try {
    const scope = (await mmkvStorage.getItem('@user:current')) || 'local';
    const settingsJson =
      (await mmkvStorage.getItem(`@user:${scope}:app_settings`)) ||
      (await mmkvStorage.getItem('app_settings'));
    const rawSettings = settingsJson ? JSON.parse(settingsJson) : {};
    const settings: AppSettings = { ...DEFAULT_SETTINGS, ...rawSettings };

    if (!settings.enableLocalScrapers || !(await localScraperService.hasScrapers())) {
      return;
    }

    logger.log('🔧 [getStreams] Executing local scrapers for', type, id);

    const scraperType = type === 'series' ? 'tv' : type;
    let tmdbId: string | null = null;
    let season: number | undefined;
    let episode: number | undefined;
    let idType: 'imdb' | 'kitsu' | 'tmdb' = 'imdb';

    try {
      const idParts = id.split(':');
      let baseId: string;

      if (idParts[0] === 'series') {
        baseId = idParts[1];
        if (scraperType === 'tv' && idParts.length >= 4) {
          season = parseInt(idParts[2], 10);
          episode = parseInt(idParts[3], 10);
        }

        if (idParts[1] === 'kitsu') {
          idType = 'kitsu';
          baseId = idParts[2];
          if (scraperType === 'tv' && idParts.length >= 5) {
            season = parseInt(idParts[3], 10);
            episode = parseInt(idParts[4], 10);
          }
        }
      } else if (idParts[0].startsWith('tt')) {
        baseId = idParts[0];
        if (scraperType === 'tv' && idParts.length >= 3) {
          season = parseInt(idParts[1], 10);
          episode = parseInt(idParts[2], 10);
        }
      } else if (idParts[0] === 'kitsu') {
        idType = 'kitsu';
        baseId = idParts[1];
        if (scraperType === 'tv' && idParts.length >= 4) {
          season = parseInt(idParts[2], 10);
          episode = parseInt(idParts[3], 10);
        }
      } else if (idParts[0] === 'tmdb') {
        idType = 'tmdb';
        baseId = idParts[1];
        if (scraperType === 'tv' && idParts.length >= 4) {
          season = parseInt(idParts[2], 10);
          episode = parseInt(idParts[3], 10);
        }
      } else {
        baseId = idParts[0];
        if (scraperType === 'tv' && idParts.length >= 3) {
          season = parseInt(idParts[1], 10);
          episode = parseInt(idParts[2], 10);
        }
      }

      if (idType === 'imdb') {
        const tmdbIdNumber = await TMDBService.getInstance().findTMDBIdByIMDB(baseId);
        if (tmdbIdNumber) {
          tmdbId = tmdbIdNumber.toString();
        } else {
          logger.log(
            '🔧 [getStreams] Skipping local scrapers: could not convert IMDb to TMDB for',
            baseId
          );
        }
      } else if (idType === 'tmdb') {
        tmdbId = baseId;
        logger.log('🔧 [getStreams] Using TMDB ID directly for local scrapers:', tmdbId);
      } else if (idType === 'kitsu') {
        logger.log('🔧 [getStreams] Skipping local scrapers for kitsu ID:', baseId);
      } else {
        tmdbId = baseId;
        logger.log('🔧 [getStreams] Using base ID as TMDB ID for local scrapers:', tmdbId);
      }
    } catch (error) {
      logger.warn('🔧 [getStreams] Skipping local scrapers due to ID parsing error:', error);
    }

    if (!tmdbId) {
      logger.log('🔧 [getStreams] Local scrapers not executed - no TMDB ID available');
      try {
        const installedScrapers = await localScraperService.getInstalledScrapers();
        installedScrapers
          .filter(scraper => scraper.enabled)
          .forEach(scraper => callback?.([], scraper.id, scraper.name, null));
      } catch (error) {
        logger.warn('🔧 [getStreams] Failed to notify UI about skipped local scrapers:', error);
      }
      return;
    }

    localScraperService.getStreams(scraperType, tmdbId, season, episode, (streams, scraperId, scraperName, error) => {
      if (!callback) {
        return;
      }

      if (error) {
        callback(null, scraperId, scraperName, error);
        return;
      }

      callback(streams || [], scraperId, scraperName, null);
    });
  } catch {
    // Local scrapers are best-effort.
  }
}

function logUnmatchedStreamAddons(
  ctx: StremioServiceContext,
  addons: Manifest[],
  effectiveType: string,
  requestedType: string,
  id: string
): void {
  logger.warn('⚠️ [getStreams] No addons found that can provide streams');

  const encodedId = encodeURIComponent(id);
  logger.log(`🚫 [getStreams] No stream addons matched. Would have requested: /stream/${effectiveType}/${encodedId}.json`);
  logger.log(
    `🚫 [getStreams] Details: requestedType='${requestedType}' effectiveType='${effectiveType}' id='${id}'`
  );

  const streamCapableAddons = addons.filter(addon =>
    addon.resources?.some(resource =>
      typeof resource === 'object' && resource !== null && 'name' in resource
        ? (resource as ResourceObject).name === 'stream'
        : resource === 'stream'
    )
  );

  if (streamCapableAddons.length === 0) {
    logger.log('🚫 [getStreams] No stream-capable addons installed');
    return;
  }

  logger.log(`🚫 [getStreams] Found ${streamCapableAddons.length} stream-capable addon(s) that didn't match:`);

  for (const addon of streamCapableAddons) {
    const streamResources = addon.resources?.filter(resource =>
      typeof resource === 'object' && resource !== null && 'name' in resource
        ? (resource as ResourceObject).name === 'stream'
        : resource === 'stream'
    );

    for (const resource of streamResources || []) {
      if (typeof resource === 'object' && resource !== null) {
        const typedResource = resource as ResourceObject;
        const types = typedResource.types || [];
        const prefixes = typedResource.idPrefixes || [];
        const typeMatch = types.includes(effectiveType);
        const prefixMatch = prefixes.length === 0 || prefixes.some(prefix => id.startsWith(prefix));

        if (addon.url) {
          const { baseUrl, queryParams } = ctx.getAddonBaseURL(addon.url);
          const wouldBeUrl = queryParams
            ? `${baseUrl}/stream/${effectiveType}/${encodedId}.json?${queryParams}`
            : `${baseUrl}/stream/${effectiveType}/${encodedId}.json`;

          console.log(
            `  ❌ ${addon.name} (${addon.id}):\n` +
              `     types=[${types.join(',')}] typeMatch=${typeMatch}\n` +
              `     prefixes=[${prefixes.join(',')}] prefixMatch=${prefixMatch}\n` +
              `     url=${wouldBeUrl}`
          );
        }
      } else if (resource === 'stream' && addon.url) {
        const addonTypes = addon.types || [];
        const addonPrefixes = addon.idPrefixes || [];
        const typeMatch = addonTypes.includes(effectiveType);
        const prefixMatch =
          addonPrefixes.length === 0 || addonPrefixes.some(prefix => id.startsWith(prefix));
        const { baseUrl, queryParams } = ctx.getAddonBaseURL(addon.url);
        const wouldBeUrl = queryParams
          ? `${baseUrl}/stream/${effectiveType}/${encodedId}.json?${queryParams}`
          : `${baseUrl}/stream/${effectiveType}/${encodedId}.json`;

        console.log(
          `  ❌ ${addon.name} (${addon.id}) [addon-level]:\n` +
            `     types=[${addonTypes.join(',')}] typeMatch=${typeMatch}\n` +
            `     prefixes=[${addonPrefixes.join(',')}] prefixMatch=${prefixMatch}\n` +
            `     url=${wouldBeUrl}`
        );
      }
    }
  }
}

export async function getStreams(
  ctx: StremioServiceContext,
  type: string,
  id: string,
  callback?: StreamCallback
): Promise<void> {
  await ctx.ensureInitialized();

  const addons = ctx.getInstalledAddons();
  await runLocalScrapers(type, id, callback);

  let effectiveType = type;
  let streamAddons = pickStreamAddons(ctx, type, id);

  logger.log(
    `🧭 [getStreams] Resolving stream addons for type='${type}' id='${id}' (matched=${streamAddons.length})`
  );

  if (streamAddons.length === 0) {
    const fallbackTypes = ['series', 'movie', 'tv', 'channel'].filter(candidate => candidate !== type);
    for (const fallbackType of fallbackTypes) {
      const fallbackAddons = pickStreamAddons(ctx, fallbackType, id);
      if (fallbackAddons.length === 0) {
        continue;
      }

      effectiveType = fallbackType;
      streamAddons = fallbackAddons;
      logger.log(
        `🔁 [getStreams] No stream addons for type '${type}', falling back to '${effectiveType}' for id '${id}'`
      );
      break;
    }
  }

  if (effectiveType !== type) {
    logger.log(
      `🧭 [getStreams] Using effectiveType='${effectiveType}' (requested='${type}') for id='${id}'`
    );
  }

  if (streamAddons.length === 0) {
    logUnmatchedStreamAddons(ctx, addons, effectiveType, type, id);
    return;
  }

  streamAddons.forEach(addon => {
    void (async () => {
      try {
        if (!addon.url) {
          logger.warn(`⚠️ [getStreams] Addon ${addon.id} has no URL`);
          callback?.(null, addon.id, addon.name, new Error('Addon has no URL'), addon.installationId);
          return;
        }

        const { baseUrl, queryParams } = ctx.getAddonBaseURL(addon.url);
        const encodedId = encodeURIComponent(id);
        const url = queryParams
          ? `${baseUrl}/stream/${effectiveType}/${encodedId}.json?${queryParams}`
          : `${baseUrl}/stream/${effectiveType}/${encodedId}.json`;

        logger.log(
          `🔗 [getStreams] GET ${url} (addon='${addon.name}' id='${addon.id}' install='${addon.installationId}' requestedType='${type}' effectiveType='${effectiveType}' rawId='${id}')`
        );

        const response = await ctx.retryRequest(() => axios.get(url, safeAxiosConfig));
        const processedStreams = Array.isArray(response.data?.streams)
          ? ctx.processStreams(response.data.streams, addon)
          : [];

        if (Array.isArray(response.data?.streams)) {
          logger.log(
            `✅ [getStreams] Processed ${processedStreams.length} valid streams from ${addon.name} (${addon.id}) [${addon.installationId}]`
          );
        } else {
          logger.log(
            `⚠️ [getStreams] No streams found in response from ${addon.name} (${addon.id}) [${addon.installationId}]`
          );
        }

        callback?.(processedStreams, addon.id, addon.name, null, addon.installationId);
      } catch (error) {
        callback?.(null, addon.id, addon.name, error as Error, addon.installationId);
      }
    })();
  });
}

export async function hasStreamProviders(
  ctx: StremioServiceContext,
  type?: string
): Promise<boolean> {
  await ctx.ensureInitialized();

  for (const addon of Array.from(ctx.installedAddons.values())) {
    if (!Array.isArray(addon.resources)) {
      continue;
    }

    const hasStreamResource = addon.resources.some(resource =>
      typeof resource === 'string'
        ? resource === 'stream'
        : (resource as ResourceObject).name === 'stream'
    );

    if (hasStreamResource) {
      if (!type) {
        return true;
      }

      const supportsType =
        addon.types?.includes(type) ||
        addon.resources.some(
          resource =>
            typeof resource === 'object' &&
            resource !== null &&
            (resource as ResourceObject).name === 'stream' &&
            (resource as ResourceObject).types?.includes(type)
        );

      if (supportsType) {
        return true;
      }
    }

    if (!type) {
      continue;
    }

    const hasMetaResource = addon.resources.some(resource =>
      typeof resource === 'string'
        ? resource === 'meta'
        : (resource as ResourceObject).name === 'meta'
    );

    if (hasMetaResource && addon.types?.includes(type)) {
      return true;
    }
  }

  return false;
}
