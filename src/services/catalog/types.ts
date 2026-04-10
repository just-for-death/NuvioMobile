export const DATA_SOURCE_KEY = 'discover_data_source';

export enum DataSource {
  STREMIO_ADDONS = 'stremio_addons',
  TMDB = 'tmdb',
}

export interface StreamingCatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[];
  optionsLimit?: number;
}

export interface StreamingCatalog {
  type: string;
  id: string;
  name: string;
  extraSupported?: string[];
  extra?: StreamingCatalogExtra[];
  showInHome?: boolean;
}

export interface StreamingAddon {
  id: string;
  name: string;
  version: string;
  description: string;
  types: string[];
  catalogs: StreamingCatalog[];
  resources: {
    name: string;
    types: string[];
    idPrefixes?: string[];
  }[];
  url?: string;
  originalUrl?: string;
  transportUrl?: string;
  transportName?: string;
}

export interface StreamingContent {
  id: string;
  type: string;
  name: string;
  tmdbId?: number;
  poster: string;
  posterShape?: 'poster' | 'square' | 'landscape';
  banner?: string;
  logo?: string;
  imdbRating?: string;
  year?: number;
  genres?: string[];
  description?: string;
  runtime?: string;
  released?: string;
  trailerStreams?: any[];
  videos?: any[];
  inLibrary?: boolean;
  directors?: string[];
  creators?: string[];
  certification?: string;
  country?: string;
  writer?: string[];
  links?: Array<{
    name: string;
    category: string;
    url: string;
  }>;
  behaviorHints?: {
    defaultVideoId?: string;
    hasScheduledVideos?: boolean;
    [key: string]: any;
  };
  imdb_id?: string;
  mal_id?: number;
  external_ids?: {
    mal_id?: number;
    imdb_id?: string;
    tmdb_id?: number;
    tvdb_id?: number;
  };
  slug?: string;
  releaseInfo?: string;
  traktSource?: 'watchlist' | 'continue-watching' | 'watched';
  addonCast?: Array<{
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
  }>;
  networks?: Array<{
    id: number | string;
    name: string;
    logo?: string;
  }>;
  tvDetails?: {
    status?: string;
    firstAirDate?: string;
    lastAirDate?: string;
    numberOfSeasons?: number;
    numberOfEpisodes?: number;
    episodeRunTime?: number[];
    type?: string;
    originCountry?: string[];
    originalLanguage?: string;
    createdBy?: Array<{
      id: number;
      name: string;
      profile_path?: string;
    }>;
  };
  movieDetails?: {
    status?: string;
    releaseDate?: string;
    runtime?: number;
    budget?: number;
    revenue?: number;
    originalLanguage?: string;
    originCountry?: string[];
    tagline?: string;
  };
  collection?: {
    id: number;
    name: string;
    poster_path?: string;
    backdrop_path?: string;
  };
  addedToLibraryAt?: number;
  addonId?: string;
}

export interface AddonSearchResults {
  addonId: string;
  addonName: string;
  sectionName: string;
  catalogIndex: number;
  results: StreamingContent[];
}

export interface GroupedSearchResults {
  byAddon: AddonSearchResults[];
  allResults: StreamingContent[];
}

export interface CatalogContent {
  addon: string;
  type: string;
  id: string;
  name: string;
  originalName?: string;
  genre?: string;
  items: StreamingContent[];
}
