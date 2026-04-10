export interface Meta {
  id: string;
  type: string;
  name: string;
  poster?: string;
  posterShape?: 'poster' | 'square' | 'landscape';
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  year?: number;
  genres?: string[];
  runtime?: string;
  cast?: string[];
  director?: string | string[];
  writer?: string | string[];
  certification?: string;
  country?: string;
  imdb_id?: string;
  slug?: string;
  released?: string;
  trailerStreams?: Array<{
    title: string;
    ytId: string;
  }>;
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
  app_extras?: {
    cast?: Array<{
      name: string;
      character?: string;
      photo?: string;
    }>;
  };
}

export interface Subtitle {
  id: string;
  url: string;
  lang: string;
  fps?: number;
  addon?: string;
  addonName?: string;
  format?: 'srt' | 'vtt' | 'ass' | 'ssa';
}

export interface SourceObject {
  url: string;
  bytes?: number;
}

export interface Stream {
  url?: string;
  ytId?: string;
  infoHash?: string;
  externalUrl?: string;
  nzbUrl?: string;
  rarUrls?: SourceObject[];
  zipUrls?: SourceObject[];
  '7zipUrls'?: SourceObject[];
  tgzUrls?: SourceObject[];
  tarUrls?: SourceObject[];
  fileIdx?: number;
  fileMustInclude?: string;
  servers?: string[];
  name?: string;
  title?: string;
  description?: string;
  addon?: string;
  addonId?: string;
  addonName?: string;
  size?: number;
  isFree?: boolean;
  isDebrid?: boolean;
  quality?: string;
  headers?: Record<string, string>;
  subtitles?: Subtitle[];
  sources?: string[];
  behaviorHints?: {
    bingeGroup?: string;
    notWebReady?: boolean;
    countryWhitelist?: string[];
    cached?: boolean;
    proxyHeaders?: {
      request?: Record<string, string>;
      response?: Record<string, string>;
    };
    videoHash?: string;
    videoSize?: number;
    filename?: string;
    [key: string]: any;
  };
}

export interface StreamResponse {
  streams: Stream[];
  addon: string;
  addonName: string;
}

export interface SubtitleResponse {
  subtitles: Subtitle[];
  addon: string;
  addonName: string;
}

export interface StreamCallback {
  (
    streams: Stream[] | null,
    addonId: string | null,
    addonName: string | null,
    error: Error | null,
    installationId?: string | null
  ): void;
}

export interface CatalogFilter {
  title: string;
  value: any;
}

interface Catalog {
  type: string;
  id: string;
  name: string;
  extraSupported?: string[];
  extraRequired?: string[];
  itemCount?: number;
  extra?: CatalogExtra[];
}

export interface CatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[];
  optionsLimit?: number;
}

interface ResourceObject {
  name: string;
  types: string[];
  idPrefixes?: string[];
  idPrefix?: string[];
}

export interface Manifest {
  id: string;
  installationId?: string;
  name: string;
  version: string;
  description: string;
  url?: string;
  originalUrl?: string;
  catalogs?: Catalog[];
  resources?: any[];
  types?: string[];
  idPrefixes?: string[];
  manifestVersion?: string;
  queryParams?: string;
  behaviorHints?: {
    configurable?: boolean;
    configurationRequired?: boolean;
    adult?: boolean;
    p2p?: boolean;
  };
  config?: ConfigObject[];
  addonCatalogs?: Catalog[];
  background?: string;
  logo?: string;
  contactEmail?: string;
}

interface ConfigObject {
  key: string;
  type: 'text' | 'number' | 'password' | 'checkbox' | 'select';
  default?: string;
  title?: string;
  options?: string[];
  required?: boolean;
}

export interface MetaLink {
  name: string;
  category: string;
  url: string;
}

export interface MetaDetails extends Meta {
  videos?: {
    id: string;
    title: string;
    released: string;
    season?: number;
    episode?: number;
    thumbnail?: string;
    streams?: Stream[];
    available?: boolean;
    overview?: string;
    trailers?: Stream[];
  }[];
  links?: MetaLink[];
}

export interface AddonCapabilities {
  name: string;
  id: string;
  version: string;
  catalogs: {
    type: string;
    id: string;
    name: string;
  }[];
  resources: {
    name: string;
    types: string[];
    idPrefixes?: string[];
  }[];
  types: string[];
}

export interface AddonCatalogItem {
  transportName: string;
  transportUrl: string;
  manifest: Manifest;
}

export type { Catalog, ConfigObject, ResourceObject };
