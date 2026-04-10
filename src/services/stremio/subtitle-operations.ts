import axios from 'axios';

import { logger } from '../../utils/logger';
import { createSafeAxiosConfig } from '../../utils/axiosConfig';

import type { StremioServiceContext } from './context';
import type { ResourceObject, Subtitle } from './types';

export async function getSubtitles(
  ctx: StremioServiceContext,
  type: string,
  id: string,
  videoId?: string
): Promise<Subtitle[]> {
  await ctx.ensureInitialized();

  const idForChecking = type === 'series' && videoId ? videoId.replace('series:', '') : id;
  const subtitleAddons = ctx.getInstalledAddons().filter(addon => {
    if (!addon.resources) {
      return false;
    }

    const subtitlesResource = addon.resources.find(resource =>
      typeof resource === 'string'
        ? resource === 'subtitles'
        : (resource as ResourceObject).name === 'subtitles'
    );

    if (!subtitlesResource) {
      return false;
    }

    let supportsType = true;
    if (typeof subtitlesResource === 'object' && subtitlesResource.types) {
      supportsType = subtitlesResource.types.includes(type);
    } else if (addon.types) {
      supportsType = addon.types.includes(type);
    }

    if (!supportsType) {
      logger.log(`[getSubtitles] Addon ${addon.name} does not support type ${type}`);
      return false;
    }

    let idPrefixes: string[] | undefined;
    if (typeof subtitlesResource === 'object' && subtitlesResource.idPrefixes) {
      idPrefixes = subtitlesResource.idPrefixes;
    } else if (addon.idPrefixes) {
      idPrefixes = addon.idPrefixes;
    }

    const supportsIdPrefix =
      !idPrefixes?.length || idPrefixes.some(prefix => idForChecking.startsWith(prefix));

    if (!supportsIdPrefix) {
      logger.log(
        `[getSubtitles] Addon ${addon.name} does not support ID prefix for ${idForChecking} (requires: ${idPrefixes?.join(', ')})`
      );
    }

    return supportsIdPrefix;
  });

  if (subtitleAddons.length === 0) {
    logger.warn('No subtitle-capable addons installed that support the requested type/id');
    return [];
  }

  logger.log(
    `[getSubtitles] Found ${subtitleAddons.length} subtitle addons for ${type}/${id}: ${subtitleAddons.map(addon => addon.name).join(', ')}`
  );

  const requests = subtitleAddons.map(async addon => {
    if (!addon.url) {
      return [] as Subtitle[];
    }

    try {
      const { baseUrl, queryParams } = ctx.getAddonBaseURL(addon.url);
      const targetId =
        type === 'series' && videoId
          ? encodeURIComponent(videoId.replace('series:', ''))
          : encodeURIComponent(id);
      const targetType = type === 'series' && videoId ? 'series' : type;
      const url = queryParams
        ? `${baseUrl}/subtitles/${targetType}/${targetId}.json?${queryParams}`
        : `${baseUrl}/subtitles/${targetType}/${targetId}.json`;

      logger.log(`[getSubtitles] Fetching subtitles from ${addon.name}: ${url}`);
      const response = await ctx.retryRequest(() =>
        axios.get(url, createSafeAxiosConfig(10000))
      );

      if (!Array.isArray(response.data?.subtitles)) {
        logger.log(`[getSubtitles] No subtitles array in response from ${addon.name}`);
        return [] as Subtitle[];
      }

      logger.log(`[getSubtitles] Got ${response.data.subtitles.length} subtitles from ${addon.name}`);
      return response.data.subtitles.map((subtitle: any, index: number) => ({
        id: subtitle.id || `${addon.id}-${subtitle.lang || 'unknown'}-${index}`,
        ...subtitle,
        addon: addon.id,
        addonName: addon.name,
      })) as Subtitle[];
    } catch (error: any) {
      logger.error(`[getSubtitles] Failed to fetch subtitles from ${addon.name}:`, error?.message || error);
      return [] as Subtitle[];
    }
  });

  const merged = ([] as Subtitle[]).concat(...(await Promise.all(requests)));
  const seen = new Set<string>();

  const deduped = merged.filter(subtitle => {
    if (!subtitle.url || seen.has(subtitle.url)) {
      return false;
    }

    seen.add(subtitle.url);
    return true;
  });

  logger.log(`[getSubtitles] Total: ${deduped.length} unique subtitles from all addons`);
  return deduped;
}
