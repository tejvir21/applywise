/**
 * Geographic relevance + eligibility.
 *
 * Rules from the brief:
 *  - Support India-wide and city-level searches (Noida, Delhi, Bengaluru,
 *    Hyderabad, Pune, Mumbai, ...).
 *  - "Remote" is NOT the same as "available in India".
 *  - Preserve eligible countries; label unknown eligibility honestly.
 *  - Never invent a location or country.
 */

import type { RemoteEligibility, RemoteType, DiscoveredJob } from './types.js';

const IN = 'IN';

/** Common Indian cities used to infer India eligibility from free-text location. */
export const INDIAN_CITIES = [
  'noida','greater noida','delhi','new delhi','gurgaon','gurugram','faridabad',
  'bengaluru','bangalore','hyderabad','telangana','pune','maharashtra','mumbai',
  'chennai','tamil nadu','kolkata','ahmedabad','jaipur','indore','kochi',
  'coimbatore','chandigarh','bhubaneswar','trivandrum','thiruvananthapuram',
  'nagpur','surat','vadodara','lucknow','visakhapatnam','mysore','mysuru',
  'goa','dehradun','coimbatore',
];

/** Country name/alias -> ISO alpha-2. Purposefully small and explicit. */
const COUNTRY_ISO: Record<string, string> = {
  india: IN, 'in': IN, bharat: IN,
  'united states': 'US', 'usa': 'US', 'us': 'US',
  'united kingdom': 'GB', 'uk': 'GB',
  canada: 'CA', germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT',
  netherlands: 'NL', ireland: 'IE', portugal: 'PT', poland: 'PL', romania: 'RO',
  sweden: 'SE', switzerland: 'CH', austria: 'AT', denmark: 'DK', norway: 'NO',
  finland: 'FI', belgium: 'BE', australia: 'AU', 'new zealand': 'NZ',
  singapore: 'SG', japan: 'JP', 'south korea': 'KR', china: 'CN',
  'united arab emirates': 'AE', uae: 'AE', israel: 'IL', brazil: 'BR',
  mexico: 'MX', indonesia: 'ID', philippines: 'PH', vietnam: 'VN',
  'south africa': 'ZA', kenya: 'KE', nigeria: 'NG', egypt: 'EG',
  'european union': 'EU', eu: 'EU',
};

/** A synthetic code meaning "explicitly worldwide/anywhere". */
export const WORLDWIDE = 'WORLDWIDE';

export function mapCountryToIso(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  if (!key) return undefined;
  if (key === 'worldwide' || key === 'anywhere' || key === 'global') return WORLDWIDE;
  if (COUNTRY_ISO[key]) return COUNTRY_ISO[key];
  // Direct ISO code (2 letters)
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  return undefined;
}

const REMOTE_RE = /\bremote\b/i;
const WORLDWIDE_RE = /\b(worldwide|global|anywhere|work from anywhere)\b/i;

/** Normalize a remoteType string to our enum. */
export function normalizeRemoteType(value: unknown): RemoteType {
  const v = String(value ?? '').toLowerCase().trim();
  if (v === 'remote') return 'remote';
  if (v === 'hybrid') return 'hybrid';
  if (v === 'onsite' || v === 'on-site' || v === 'on site') return 'onsite';
  if (v === 'flexible') return 'flexible';
  return 'unknown';
}

export interface GeoInput {
  locationText?: string;
  countryRaw?: string; // source-provided country string
  countryIsoRaw?: string; // source-provided ISO (e.g. Lever "IN")
  remoteTypeRaw?: unknown; // e.g. Ashby isRemote, Lever workplaceType
  /** Explicit eligible countries for remote (ISO codes). */
  eligibleCountriesRaw?: string[];
}

export interface GeoResult {
  country?: string;
  countryIso?: string;
  remoteType: RemoteType;
  remoteEligibility: RemoteEligibility;
  remoteEligibleCountries?: string[];
  indiaEligible: boolean;
}

/**
 * Resolve geography + eligibility. India eligibility is true only when the
 * listing's location or explicit eligibility names India (or worldwide, which
 * the caller may optionally treat as including India).
 */
export function resolveGeo(input: GeoInput): GeoResult {
  const locationText = input.locationText?.trim();
  const hasIso = input.countryIsoRaw && input.countryIsoRaw.trim().length === 2
    ? input.countryIsoRaw.trim().toUpperCase()
    : undefined;
  const isoFromName = mapCountryToIso(input.countryRaw);
  const countryIso = hasIso ?? (isoFromName === WORLDWIDE ? undefined : isoFromName);
  const isWorldwide = isoFromName === WORLDWIDE || (locationText ? WORLDWIDE_RE.test(locationText) : false);

  // Remote type
  let remoteType: RemoteType;
  if (typeof input.remoteTypeRaw === 'boolean') {
    remoteType = input.remoteTypeRaw ? 'remote' : 'unknown';
  } else if (locationText && REMOTE_RE.test(locationText)) {
    remoteType = 'remote';
  } else {
    remoteType = normalizeRemoteType(input.remoteTypeRaw);
  }
  if (remoteType === 'unknown' && locationText && REMOTE_RE.test(locationText)) {
    remoteType = 'remote';
  }

  const isRemote = remoteType === 'remote';
  const eligibleCountries = normalizeEligibleCountries(input.eligibleCountriesRaw, locationText);

  let remoteEligibility: RemoteEligibility;
  let remoteEligibleCountries: string[] | undefined;
  if (!isRemote) {
    remoteEligibility = 'onsite';
  } else if (isWorldwide) {
    remoteEligibility = 'remote_worldwide';
  } else if (eligibleCountries && eligibleCountries.length > 0) {
    remoteEligibility = 'remote_listed';
    remoteEligibleCountries = eligibleCountries;
  } else {
    remoteEligibility = 'unknown';
  }

  // India eligibility: explicit IN, Indian city in text, eligible list has IN,
  // or worldwide (worldwide includes India).
  const lower = locationText?.toLowerCase() ?? '';
  const cityInIndia = INDIAN_CITIES.some((c) => lower.includes(c));
  const eligibleIndia = remoteEligibleCountries?.includes(IN) ?? false;
  const indiaEligible =
    countryIso === IN ||
    cityInIndia ||
    eligibleIndia ||
    (isRemote && isWorldwide) ||
    (isRemote && remoteEligibility === 'remote_worldwide');

  return {
    country: input.countryRaw ?? (countryIso ? isoToName(countryIso) : undefined),
    countryIso,
    remoteType,
    remoteEligibility,
    remoteEligibleCountries,
    indiaEligible: Boolean(indiaEligible),
  };
}

function normalizeEligibleCountries(raw: string[] | undefined, locationText?: string): string[] | undefined {
  if (raw && raw.length > 0) {
    const codes = raw
      .map((r) => mapCountryToIso(r))
      .filter((c): c is string => Boolean(c) && c !== WORLDWIDE);
    if (codes.length) return Array.from(new Set(codes));
  }
  // Very common remote pattern: "Remote - India, Singapore" etc.
  if (locationText) {
    const after = locationText.replace(/remote[-\s]*/i, '');
    const parts = after.split(/[,/]| and | & /i).map((p) => p.trim()).filter(Boolean);
    const codes = parts.map((p) => mapCountryToIso(p)).filter((c): c is string => Boolean(c) && c !== WORLDWIDE);
    if (codes.length) return Array.from(new Set(codes));
  }
  return undefined;
}

function isoToName(iso: string): string {
  const found = Object.keys(COUNTRY_ISO).find((k) => COUNTRY_ISO[k] === iso);
  return found ? found.toUpperCase() : iso;
}

/**
 * Should a listing be included given the search's remote preferences and target
 * country? Kept separate from the city substring check.
 *  - remote worldwide: included only if includeWorldwideRemote
 *  - remote (non-worldwide): included only if includeRemote
 *  - non-remote: included only if it matches the target country/eligibility
 */
export function passesGeo(
  result: GeoResult,
  opts: { targetCountryIso: string; includeRemote: boolean; includeWorldwideRemote: boolean },
): boolean {
  const isRemote = result.remoteType === 'remote';
  const isWorldwideRemote = result.remoteEligibility === 'remote_worldwide';

  if (isRemote) {
    if (isWorldwideRemote && !opts.includeWorldwideRemote) return false;
    if (!isWorldwideRemote && !opts.includeRemote) return false;
    // Remote listings also must be India-eligible for an India search (unless
    // worldwide is explicitly allowed above — which still requires indiaEligible).
    return opts.targetCountryIso === 'IN' ? result.indiaEligible : true;
  }

  // Onsite/hybrid: must match the target country/eligibility.
  if (opts.targetCountryIso === 'IN') return result.indiaEligible;
  return result.countryIso === opts.targetCountryIso;
}

/** City/region substring check against the listing's raw location text. */
export function passesCityFilter(locationText: string | undefined, city: string | undefined): boolean {
  const c = city?.trim().toLowerCase();
  if (!c || c === 'india') return true;
  return (locationText ?? '').toLowerCase().includes(c);
}

/** Geo pass using the already-resolved fields stored on a DiscoveredJob. */
export function jobPassesGeo(
  job: Pick<DiscoveredJob, 'remoteType' | 'remoteEligibility' | 'indiaEligible' | 'countryIso'>,
  opts: { targetCountryIso: string; includeRemote: boolean; includeWorldwideRemote: boolean },
): boolean {
  return passesGeo(
    {
      country: undefined,
      countryIso: job.countryIso,
      remoteType: job.remoteType,
      remoteEligibility: job.remoteEligibility,
      indiaEligible: job.indiaEligible,
    },
    opts,
  );
}
