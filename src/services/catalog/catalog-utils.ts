import type { Manifest } from '../stremioService';

import type { StreamingAddon, StreamingCatalog } from './types';

export function convertManifestToStreamingAddon(manifest: Manifest): StreamingAddon {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    types: manifest.types || [],
    catalogs: (manifest.catalogs || []).map(catalog => ({
      ...catalog,
      extraSupported: catalog.extraSupported || [],
      extra: (catalog.extra || []).map(extra => ({
        name: extra.name,
        isRequired: extra.isRequired,
        options: extra.options,
        optionsLimit: extra.optionsLimit,
      })),
    })),
    resources: manifest.resources || [],
    url: (manifest.url || manifest.originalUrl) as any,
    originalUrl: (manifest.originalUrl || manifest.url) as any,
    transportUrl: manifest.url,
    transportName: manifest.name,
  };
}

export async function getAllAddons(getInstalledAddons: () => Promise<Manifest[]>): Promise<StreamingAddon[]> {
  const addons = await getInstalledAddons();
  return addons.map(convertManifestToStreamingAddon);
}

export function catalogSupportsExtra(catalog: StreamingCatalog, extraName: string): boolean {
  return (catalog.extraSupported || []).includes(extraName) ||
    (catalog.extra || []).some(extra => extra.name === extraName);
}

export function getRequiredCatalogExtras(catalog: StreamingCatalog): string[] {
  return (catalog.extra || []).filter(extra => extra.isRequired).map(extra => extra.name);
}

export function canBrowseCatalog(catalog: StreamingCatalog): boolean {
  if (
    (catalog.id && catalog.id.startsWith('search.')) ||
    (catalog.type && catalog.type.startsWith('search'))
  ) {
    return false;
  }

  const requiredExtras = getRequiredCatalogExtras(catalog);
  return requiredExtras.every(extraName => extraName === 'genre');
}

export function isVisibleOnHome(catalog: StreamingCatalog, addonCatalogs: StreamingCatalog[]): boolean {
  if (
    (catalog.id && catalog.id.startsWith('search.')) ||
    (catalog.type && catalog.type.startsWith('search'))
  ) {
    return false;
  }

  const requiredExtras = getRequiredCatalogExtras(catalog);
  if (requiredExtras.length > 0) {
    return false;
  }

  const addonUsesShowInHome = addonCatalogs.some(addonCatalog => addonCatalog.showInHome === true);
  if (addonUsesShowInHome) {
    return catalog.showInHome === true;
  }

  return true;
}

export function canSearchCatalog(catalog: StreamingCatalog): boolean {
  if (!catalogSupportsExtra(catalog, 'search')) {
    return false;
  }

  const requiredExtras = getRequiredCatalogExtras(catalog);
  return requiredExtras.every(extraName => extraName === 'search');
}
