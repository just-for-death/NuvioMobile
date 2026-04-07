import { logger } from "../utils/logger";
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { GithubReleaseInfo } from './githubReleaseService';

// Android Intent Flags
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 268435456; // 0x10000000

class AndroidUpdateService {
    /**
     * Downloads and installs the APK from the given GitHub release.
     * Matches the device architecture to the correct APK asset.
     * 
     * @param release The GitHub release info containing assets
     * @returns Promise<boolean> true if installation started, false otherwise
     */
    /**
     * Downloads and installs the APK from the given GitHub release.
     * Matches the device architecture to the correct APK asset.
     * 
     * @param release The GitHub release info containing assets
     * @param onProgress Optional callback for download progress (0-1)
     * @returns Promise<boolean> true if installation started, false otherwise
     */
    async downloadAndInstallUpdate(release: GithubReleaseInfo, onProgress?: (progress: number) => void): Promise<boolean> {
        if (Platform.OS !== 'android') return false;

        const apkUrl = this.getBestApkUrl(release);
        if (!apkUrl) {
            logger.warn('No suitable APK found for this device architecture');
            return false;
        }

        try {
            // Create a temporary file path
            const filename = `nuvio-update-${release.tag_name}.apk`;
            const cacheDir = FileSystem.cacheDirectory;
            if (!cacheDir) {
                logger.error('Cache directory is not available');
                return false;
            }
            const downloadDest = `${cacheDir}${filename}`;

            // Create a resumable download to track progress
            const callback = (downloadProgress: FileSystem.DownloadProgressData) => {
                const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                if (onProgress) onProgress(progress);
            };

            const downloadResumable = FileSystem.createDownloadResumable(
                apkUrl,
                downloadDest,
                {},
                callback
            );

            // Download the APK
            const downloadRes = await downloadResumable.downloadAsync();

            if (!downloadRes || downloadRes.status !== 200) {
                logger.error('Failed to download APK', downloadRes?.status);
                return false;
            }

            // Get Content URI using Expo's FileSystem
            const contentUri = await FileSystem.getContentUriAsync(downloadDest);

            // Launch the intent to install
            logger.log('AndroidUpdateService: Starting installation intent with content URI:', contentUri);
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                data: contentUri,
                flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
                type: 'application/vnd.android.package-archive',
            });

            logger.log('AndroidUpdateService: Installation intent started successfully');
            return true;
        } catch (error) {
            logger.error('Error downloading or installing update:', error);
            return false;
        }
    }

    /**
     * Selects the best APK URL based on device architecture.
     * Priority: Specific Arch > Universal > First APK found
     */
    private getBestApkUrl(release: GithubReleaseInfo): string | null {
        logger.log('AndroidUpdateService: Finding best APK for release assets:', release.assets?.length);
        if (!release.assets || release.assets.length === 0) return null;

        const supportedArchs = Device.supportedCpuArchitectures; // e.g. ['arm64-v8a', 'armeabi-v7a']
        logger.log('Device architectures:', supportedArchs);

        // Helper to find asset containing string (case-insensitive)
        const findAsset = (keyword: string) =>
            release.assets?.find(a =>
                a.name.toLowerCase().includes(keyword.toLowerCase()) &&
                a.name.toLowerCase().endsWith('.apk')
            );

        // 1. Try to match supported architectures in order
        if (supportedArchs) {
            for (const arch of supportedArchs) {
                const match = findAsset(arch);
                if (match) return match.browser_download_url;
            }
        }

        // 2. No fallback: If no specific architecture match is found, return null.
        // User requested strict matching to avoid downloading incompatible APKs.
        logger.warn('AndroidUpdateService: No matching APK found for device architectures:', supportedArchs);
        return null;
    }
}

export default new AndroidUpdateService();
