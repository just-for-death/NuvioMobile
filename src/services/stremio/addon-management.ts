import axios from 'axios';

import { mmkvStorage } from '../mmkvStorage';
import { logger } from '../../utils/logger';
import { safeAxiosConfig } from '../../utils/axiosConfig';

import { ADDON_EVENTS, addonEmitter } from './events';
import type { StremioServiceContext } from './context';
import type { Manifest, ResourceObject } from './types';

const CINEMETA_ID = 'com.linvo.cinemeta';
const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json';
const OPENSUBTITLES_ID = 'org.stremio.opensubtitlesv3';
const OPENSUBTITLES_URL = 'https://opensubtitles-v3.strem.io/manifest.json';

function createFallbackCinemetaManifest(ctx: StremioServiceContext): Manifest {
  return {
    id: CINEMETA_ID,
    installationId: ctx.generateInstallationId(CINEMETA_ID),
    name: 'Cinemeta',
    version: '3.0.13',
    description: 'Provides metadata for movies and series from TheTVDB, TheMovieDB, etc.',
    url: 'https://v3-cinemeta.strem.io',
    originalUrl: CINEMETA_URL,
    types: ['movie', 'series'],
    catalogs: [
      {
        type: 'movie',
        id: 'top',
        name: 'Popular',
        extraSupported: ['search', 'genre', 'skip'],
      },
      {
        type: 'series',
        id: 'top',
        name: 'Popular',
        extraSupported: ['search', 'genre', 'skip'],
      },
    ],
    resources: [
      {
        name: 'catalog',
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
      },
      {
        name: 'meta',
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
      },
    ],
    behaviorHints: {
      configurable: false,
    },
  };
}

function createFallbackOpenSubtitlesManifest(ctx: StremioServiceContext): Manifest {
  return {
    id: OPENSUBTITLES_ID,
    installationId: ctx.generateInstallationId(OPENSUBTITLES_ID),
    name: 'OpenSubtitles v3',
    version: '1.0.0',
    description: 'OpenSubtitles v3 Addon for Stremio',
    url: 'https://opensubtitles-v3.strem.io',
    originalUrl: OPENSUBTITLES_URL,
    types: ['movie', 'series'],
    catalogs: [],
    resources: [
      {
        name: 'subtitles',
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
      },
    ],
    behaviorHints: {
      configurable: false,
    },
  };
}

async function getCurrentScope(): Promise<string> {
  return (await mmkvStorage.getItem('@user:current')) || 'local';
}

export async function initializeAddons(ctx: StremioServiceContext): Promise<void> {
  if (ctx.initialized) {
    return;
  }

  try {
    const scope = await getCurrentScope();
    let storedAddons = await mmkvStorage.getItem(`@user:${scope}:${ctx.STORAGE_KEY}`);
    if (!storedAddons) {
      storedAddons = await mmkvStorage.getItem(ctx.STORAGE_KEY);
    }
    if (!storedAddons) {
      storedAddons = await mmkvStorage.getItem(`@user:local:${ctx.STORAGE_KEY}`);
    }

    if (storedAddons) {
      const parsed = JSON.parse(storedAddons) as Manifest[];
      ctx.installedAddons = new Map();

      for (const addon of parsed) {
        if (!addon?.id) {
          continue;
        }

        if (!addon.installationId) {
          addon.installationId = ctx.generateInstallationId(addon.id);
        }

        ctx.installedAddons.set(addon.installationId, addon);
      }
    }

    const hasUserRemovedCinemeta = await ctx.hasUserRemovedAddon(CINEMETA_ID);
    const hasCinemeta = Array.from(ctx.installedAddons.values()).some(addon => addon.id === CINEMETA_ID);

    if (!hasCinemeta && !hasUserRemovedCinemeta) {
      try {
        const cinemetaManifest = await getManifest(ctx, CINEMETA_URL);
        cinemetaManifest.installationId = ctx.generateInstallationId(CINEMETA_ID);
        ctx.installedAddons.set(cinemetaManifest.installationId, cinemetaManifest);
      } catch {
        const fallbackManifest = createFallbackCinemetaManifest(ctx);
        ctx.installedAddons.set(fallbackManifest.installationId!, fallbackManifest);
      }
    }

    const hasUserRemovedOpenSubtitles = await ctx.hasUserRemovedAddon(OPENSUBTITLES_ID);
    const hasOpenSubtitles = Array.from(ctx.installedAddons.values()).some(
      addon => addon.id === OPENSUBTITLES_ID
    );

    if (!hasOpenSubtitles && !hasUserRemovedOpenSubtitles) {
      try {
        const openSubsManifest = await getManifest(ctx, OPENSUBTITLES_URL);
        openSubsManifest.installationId = ctx.generateInstallationId(OPENSUBTITLES_ID);
        ctx.installedAddons.set(openSubsManifest.installationId, openSubsManifest);
      } catch {
        const fallbackManifest = createFallbackOpenSubtitlesManifest(ctx);
        ctx.installedAddons.set(fallbackManifest.installationId!, fallbackManifest);
      }
    }

    let storedOrder = await mmkvStorage.getItem(`@user:${scope}:${ctx.ADDON_ORDER_KEY}`);
    if (!storedOrder) {
      storedOrder = await mmkvStorage.getItem(ctx.ADDON_ORDER_KEY);
    }
    if (!storedOrder) {
      storedOrder = await mmkvStorage.getItem(`@user:local:${ctx.ADDON_ORDER_KEY}`);
    }

    if (storedOrder) {
      ctx.addonOrder = JSON.parse(storedOrder).filter((installationId: string) =>
        ctx.installedAddons.has(installationId)
      );
    }

    const cinemetaInstallation = Array.from(ctx.installedAddons.values()).find(
      addon => addon.id === CINEMETA_ID
    );
    if (
      cinemetaInstallation?.installationId &&
      !ctx.addonOrder.includes(cinemetaInstallation.installationId) &&
      !(await ctx.hasUserRemovedAddon(CINEMETA_ID))
    ) {
      ctx.addonOrder.push(cinemetaInstallation.installationId);
    }

    const openSubtitlesInstallation = Array.from(ctx.installedAddons.values()).find(
      addon => addon.id === OPENSUBTITLES_ID
    );
    if (
      openSubtitlesInstallation?.installationId &&
      !ctx.addonOrder.includes(openSubtitlesInstallation.installationId) &&
      !(await ctx.hasUserRemovedAddon(OPENSUBTITLES_ID))
    ) {
      ctx.addonOrder.push(openSubtitlesInstallation.installationId);
    }

    const missingInstallationIds = Array.from(ctx.installedAddons.keys()).filter(
      installationId => !ctx.addonOrder.includes(installationId)
    );
    ctx.addonOrder = [...ctx.addonOrder, ...missingInstallationIds];

    await ctx.saveAddonOrder();
    await ctx.saveInstalledAddons();
    ctx.initialized = true;
  } catch {
    ctx.installedAddons = new Map();
    ctx.addonOrder = [];
    ctx.initialized = true;
  }
}

export function getAllSupportedTypes(ctx: StremioServiceContext): string[] {
  const types = new Set<string>();

  for (const addon of ctx.getInstalledAddons()) {
    addon.types?.forEach(type => types.add(type));

    for (const resource of addon.resources || []) {
      if (typeof resource === 'object' && resource !== null && 'name' in resource) {
        (resource as ResourceObject).types?.forEach(type => types.add(type));
      }
    }

    for (const catalog of addon.catalogs || []) {
      if (catalog.type) {
        types.add(catalog.type);
      }
    }
  }

  return Array.from(types);
}

export function getAllSupportedIdPrefixes(ctx: StremioServiceContext, type: string): string[] {
  const prefixes = new Set<string>();

  for (const addon of ctx.getInstalledAddons()) {
    addon.idPrefixes?.forEach(prefix => prefixes.add(prefix));

    for (const resource of addon.resources || []) {
      if (typeof resource !== 'object' || resource === null || !('name' in resource)) {
        continue;
      }

      const typedResource = resource as ResourceObject;
      if (!typedResource.types?.includes(type)) {
        continue;
      }

      typedResource.idPrefixes?.forEach(prefix => prefixes.add(prefix));
    }
  }

  return Array.from(prefixes);
}

export function isCollectionContent(
  ctx: StremioServiceContext,
  id: string
): { isCollection: boolean; addon?: Manifest } {
  for (const addon of ctx.getInstalledAddons()) {
    const supportsCollections =
      addon.types?.includes('collections') ||
      addon.catalogs?.some(catalog => catalog.type === 'collections');

    if (!supportsCollections) {
      continue;
    }

    const addonPrefixes = addon.idPrefixes || [];
    const resourcePrefixes =
      addon.resources
        ?.filter(
          resource =>
            typeof resource === 'object' &&
            resource !== null &&
            'name' in resource &&
            (((resource as ResourceObject).name === 'meta') ||
              (resource as ResourceObject).name === 'catalog')
        )
        .flatMap(resource => (resource as ResourceObject).idPrefixes || []) || [];

    if ([...addonPrefixes, ...resourcePrefixes].some(prefix => id.startsWith(prefix))) {
      return { isCollection: true, addon };
    }
  }

  return { isCollection: false };
}

export async function getManifest(ctx: StremioServiceContext, url: string): Promise<Manifest> {
  try {
    const manifestUrl = url.endsWith('manifest.json') ? url : `${url.replace(/\/$/, '')}/manifest.json`;
    const response = await ctx.retryRequest(() => axios.get(manifestUrl, safeAxiosConfig));
    const manifest = response.data as Manifest;

    manifest.originalUrl = url;
    manifest.url = url.replace(/manifest\.json$/, '');

    if (!manifest.id) {
      manifest.id = ctx.formatId(url);
    }

    return manifest;
  } catch (error) {
    logger.error(`Failed to fetch manifest from ${url}:`, error);
    throw new Error(`Failed to fetch addon manifest from ${url}`);
  }
}

export async function installAddon(ctx: StremioServiceContext, url: string): Promise<void> {
  const manifest = await getManifest(ctx, url);
  if (!manifest?.id) {
    throw new Error('Invalid addon manifest');
  }

  const existingInstallations = Array.from(ctx.installedAddons.values()).filter(
    addon => addon.id === manifest.id
  );
  if (existingInstallations.length > 0 && !ctx.addonProvidesStreams(manifest)) {
    throw new Error(
      'This addon is already installed. Multiple installations are only allowed for stream providers.'
    );
  }

  manifest.installationId = ctx.generateInstallationId(manifest.id);
  ctx.installedAddons.set(manifest.installationId, manifest);

  await ctx.unmarkAddonAsRemovedByUser(manifest.id);
  await cleanupRemovedAddonFromStorage(ctx, manifest.id);

  if (!ctx.addonOrder.includes(manifest.installationId)) {
    ctx.addonOrder.push(manifest.installationId);
  }

  await ctx.saveInstalledAddons();
  await ctx.saveAddonOrder();
  addonEmitter.emit(ADDON_EVENTS.ADDON_ADDED, {
    installationId: manifest.installationId,
    addonId: manifest.id,
  });
}

export async function removeAddon(ctx: StremioServiceContext, installationId: string): Promise<void> {
  if (!ctx.installedAddons.has(installationId)) {
    return;
  }

  const addon = ctx.installedAddons.get(installationId);
  ctx.installedAddons.delete(installationId);
  ctx.addonOrder = ctx.addonOrder.filter(id => id !== installationId);

  if (addon) {
    const remainingInstallations = Array.from(ctx.installedAddons.values()).filter(
      entry => entry.id === addon.id
    );
    if (remainingInstallations.length === 0) {
      await markAddonAsRemovedByUser(addon.id);
      await cleanupRemovedAddonFromStorage(ctx, addon.id);
    }
  }

  await ctx.saveInstalledAddons();
  await ctx.saveAddonOrder();
  addonEmitter.emit(ADDON_EVENTS.ADDON_REMOVED, installationId);
}

export function getInstalledAddons(ctx: StremioServiceContext): Manifest[] {
  return ctx.addonOrder
    .filter(installationId => ctx.installedAddons.has(installationId))
    .map(installationId => ctx.installedAddons.get(installationId) as Manifest);
}

export async function getInstalledAddonsAsync(ctx: StremioServiceContext): Promise<Manifest[]> {
  await ctx.ensureInitialized();
  return getInstalledAddons(ctx);
}

export function isPreInstalledAddon(): boolean {
  return false;
}

export async function hasUserRemovedAddon(addonId: string): Promise<boolean> {
  try {
    const removedAddons = await mmkvStorage.getItem('user_removed_addons');
    if (!removedAddons) {
      return false;
    }

    const removedList = JSON.parse(removedAddons);
    return Array.isArray(removedList) && removedList.includes(addonId);
  } catch {
    return false;
  }
}

async function markAddonAsRemovedByUser(addonId: string): Promise<void> {
  try {
    const removedAddons = await mmkvStorage.getItem('user_removed_addons');
    let removedList = removedAddons ? JSON.parse(removedAddons) : [];
    if (!Array.isArray(removedList)) {
      removedList = [];
    }

    if (!removedList.includes(addonId)) {
      removedList.push(addonId);
      await mmkvStorage.setItem('user_removed_addons', JSON.stringify(removedList));
    }
  } catch {
    // Best-effort cleanup only.
  }
}

export async function unmarkAddonAsRemovedByUser(addonId: string): Promise<void> {
  try {
    const removedAddons = await mmkvStorage.getItem('user_removed_addons');
    if (!removedAddons) {
      return;
    }

    const removedList = JSON.parse(removedAddons);
    if (!Array.isArray(removedList)) {
      return;
    }

    const updatedList = removedList.filter(id => id !== addonId);
    await mmkvStorage.setItem('user_removed_addons', JSON.stringify(updatedList));
  } catch {
    // Best-effort cleanup only.
  }
}

async function cleanupRemovedAddonFromStorage(
  ctx: StremioServiceContext,
  addonId: string
): Promise<void> {
  try {
    const scope = await getCurrentScope();
    const keys = [
      `@user:${scope}:${ctx.ADDON_ORDER_KEY}`,
      ctx.ADDON_ORDER_KEY,
      `@user:local:${ctx.ADDON_ORDER_KEY}`,
    ];

    for (const key of keys) {
      const storedOrder = await mmkvStorage.getItem(key);
      if (!storedOrder) {
        continue;
      }

      const order = JSON.parse(storedOrder);
      if (!Array.isArray(order)) {
        continue;
      }

      const updatedOrder = order.filter(id => id !== addonId);
      await mmkvStorage.setItem(key, JSON.stringify(updatedOrder));
    }
  } catch {
    // Best-effort cleanup only.
  }
}
