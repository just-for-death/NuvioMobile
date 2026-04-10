import { ADDON_EVENTS, addonEmitter } from './events';
import type { StremioServiceContext } from './context';

export function moveAddonUp(ctx: StremioServiceContext, installationId: string): boolean {
  const index = ctx.addonOrder.indexOf(installationId);
  if (index <= 0) {
    return false;
  }

  [ctx.addonOrder[index - 1], ctx.addonOrder[index]] = [
    ctx.addonOrder[index],
    ctx.addonOrder[index - 1],
  ];
  void ctx.saveAddonOrder();
  addonEmitter.emit(ADDON_EVENTS.ORDER_CHANGED);
  return true;
}

export function moveAddonDown(ctx: StremioServiceContext, installationId: string): boolean {
  const index = ctx.addonOrder.indexOf(installationId);
  if (index < 0 || index >= ctx.addonOrder.length - 1) {
    return false;
  }

  [ctx.addonOrder[index], ctx.addonOrder[index + 1]] = [
    ctx.addonOrder[index + 1],
    ctx.addonOrder[index],
  ];
  void ctx.saveAddonOrder();
  addonEmitter.emit(ADDON_EVENTS.ORDER_CHANGED);
  return true;
}

export async function applyAddonOrderFromManifestUrls(
  ctx: StremioServiceContext,
  manifestUrls: string[]
): Promise<boolean> {
  await ctx.ensureInitialized();
  if (!Array.isArray(manifestUrls) || manifestUrls.length === 0) {
    return false;
  }

  const normalizeManifestUrl = (raw: string): string => {
    const value = (raw || '').trim();
    if (!value) {
      return '';
    }

    const withManifest = value.includes('manifest.json')
      ? value
      : `${value.replace(/\/$/, '')}/manifest.json`;
    return withManifest.toLowerCase();
  };

  const localByNormalizedUrl = new Map<string, string[]>();
  for (const installationId of ctx.addonOrder) {
    const addon = ctx.installedAddons.get(installationId);
    if (!addon) {
      continue;
    }

    const normalized = normalizeManifestUrl(addon.originalUrl || addon.url || '');
    if (!normalized) {
      continue;
    }

    const matches = localByNormalizedUrl.get(normalized) || [];
    matches.push(installationId);
    localByNormalizedUrl.set(normalized, matches);
  }

  const nextOrder: string[] = [];
  const seenInstallations = new Set<string>();

  for (const remoteUrl of manifestUrls) {
    const normalizedRemote = normalizeManifestUrl(remoteUrl);
    const candidates = localByNormalizedUrl.get(normalizedRemote);
    if (!normalizedRemote || !candidates?.length) {
      continue;
    }

    const installationId = candidates.shift();
    if (!installationId || seenInstallations.has(installationId)) {
      continue;
    }

    nextOrder.push(installationId);
    seenInstallations.add(installationId);
  }

  for (const installationId of ctx.addonOrder) {
    if (!ctx.installedAddons.has(installationId) || seenInstallations.has(installationId)) {
      continue;
    }

    nextOrder.push(installationId);
    seenInstallations.add(installationId);
  }

  const changed =
    nextOrder.length !== ctx.addonOrder.length ||
    nextOrder.some((id, index) => id !== ctx.addonOrder[index]);

  if (!changed) {
    return false;
  }

  ctx.addonOrder = nextOrder;
  await ctx.saveAddonOrder();
  addonEmitter.emit(ADDON_EVENTS.ORDER_CHANGED);
  return true;
}
