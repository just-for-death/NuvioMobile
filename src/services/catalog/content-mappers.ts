import { TMDBService } from '../tmdbService';
import { logger } from '../../utils/logger';

import type { Meta } from '../stremioService';

import { createLibraryKey } from './library';
import type { StreamingContent } from './types';

const FALLBACK_POSTER_URL = 'https://via.placeholder.com/300x450/cccccc/666666?text=No+Image';

export function convertMetaToStreamingContent(
  meta: Meta,
  library: Record<string, StreamingContent>
): StreamingContent {
  let posterUrl = meta.poster;
  if (!posterUrl || posterUrl.trim() === '' || posterUrl === 'null' || posterUrl === 'undefined') {
    posterUrl = FALLBACK_POSTER_URL;
  }

  let logoUrl = (meta as any).logo;
  if (!logoUrl || logoUrl.trim() === '' || logoUrl === 'null' || logoUrl === 'undefined') {
    logoUrl = undefined;
  }

  return {
    id: meta.id,
    type: meta.type,
    name: meta.name,
    poster: posterUrl,
    posterShape: meta.posterShape || 'poster',
    banner: meta.background,
    logo: logoUrl,
    imdbRating: meta.imdbRating,
    year: meta.year,
    genres: meta.genres,
    description: meta.description,
    runtime: meta.runtime,
    inLibrary: library[createLibraryKey(meta.type, meta.id)] !== undefined,
    certification: meta.certification,
    releaseInfo: meta.releaseInfo,
  };
}

export function convertMetaToStreamingContentEnhanced(
  meta: Meta,
  library: Record<string, StreamingContent>
): StreamingContent {
  const converted: StreamingContent = {
    id: meta.id,
    type: meta.type,
    name: meta.name,
    poster: meta.poster || FALLBACK_POSTER_URL,
    posterShape: meta.posterShape || 'poster',
    banner: meta.background,
    logo: (meta as any).logo || undefined,
    imdbRating: meta.imdbRating,
    year: meta.year,
    genres: meta.genres,
    description: meta.description,
    runtime: meta.runtime,
    inLibrary: library[createLibraryKey(meta.type, meta.id)] !== undefined,
    certification: meta.certification,
    directors: (meta as any).director
      ? (Array.isArray((meta as any).director) ? (meta as any).director : [(meta as any).director])
      : undefined,
    writer: (meta as any).writer || undefined,
    country: (meta as any).country || undefined,
    imdb_id: (meta as any).imdb_id || undefined,
    slug: (meta as any).slug || undefined,
    releaseInfo: meta.releaseInfo || (meta as any).releaseInfo || undefined,
    trailerStreams: (meta as any).trailerStreams || undefined,
    links: (meta as any).links || undefined,
    behaviorHints: (meta as any).behaviorHints || undefined,
  };

  if ((meta as any).app_extras?.cast && Array.isArray((meta as any).app_extras.cast)) {
    converted.addonCast = (meta as any).app_extras.cast.map((castMember: any, index: number) => ({
      id: index + 1,
      name: castMember.name || 'Unknown',
      character: castMember.character || '',
      profile_path: castMember.photo || null,
    }));
  } else if (meta.cast && Array.isArray(meta.cast)) {
    converted.addonCast = meta.cast.map((castName: string, index: number) => ({
      id: index + 1,
      name: castName || 'Unknown',
      character: '',
      profile_path: null,
    }));
  }

  if ((meta as any).trailerStreams?.length > 0) {
    logger.log(`🎬 Enhanced metadata: Found ${(meta as any).trailerStreams.length} trailers for ${meta.name}`);
  }

  if ((meta as any).links?.length > 0) {
    logger.log(`🔗 Enhanced metadata: Found ${(meta as any).links.length} links for ${meta.name}`);
  }

  if (converted.addonCast && converted.addonCast.length > 0) {
    logger.log(`🎭 Enhanced metadata: Found ${converted.addonCast.length} cast members from addon for ${meta.name}`);
  }

  if ((meta as any).videos) {
    converted.videos = (meta as any).videos;
  }

  return converted;
}

export async function convertTMDBToStreamingContent(
  item: any,
  type: 'movie' | 'tv',
  library: Record<string, StreamingContent>
): Promise<StreamingContent> {
  const id = item.external_ids?.imdb_id || `tmdb:${item.id}`;
  const name = type === 'movie' ? item.title : item.name;
  const posterPath = item.poster_path;

  let genres: string[] = [];
  if (item.genre_ids && item.genre_ids.length > 0) {
    try {
      const tmdbService = TMDBService.getInstance();
      const genreLists = type === 'movie'
        ? await tmdbService.getMovieGenres()
        : await tmdbService.getTvGenres();

      genres = item.genre_ids
        .map((genreId: number) => {
          const genre = genreLists.find(currentGenre => currentGenre.id === genreId);
          return genre ? genre.name : null;
        })
        .filter(Boolean) as string[];
    } catch (error) {
      logger.error('Failed to get genres for TMDB content:', error);
    }
  }

  const contentType = type === 'movie' ? 'movie' : 'series';

  return {
    id,
    type: contentType,
    name: name || 'Unknown',
    poster: posterPath
      ? `https://image.tmdb.org/t/p/w500${posterPath}`
      : FALLBACK_POSTER_URL,
    posterShape: 'poster',
    banner: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : undefined,
    year: type === 'movie'
      ? (item.release_date ? new Date(item.release_date).getFullYear() : undefined)
      : (item.first_air_date ? new Date(item.first_air_date).getFullYear() : undefined),
    description: item.overview,
    genres,
    inLibrary: library[createLibraryKey(contentType, id)] !== undefined,
  };
}
