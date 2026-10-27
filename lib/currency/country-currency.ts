import { BASE_CURRENCY } from "./config";

const EUROZONE = [
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT",
  "LU", "MT", "NL", "PT", "SK", "SI", "ES", "AD", "MC", "SM", "VA", "ME", "XK",
];

/** Countries that use USD (or are pegged to it for everyday prices). */
const DOLLARIZED = [
  "US", "EC", "SV", "PA", "PR", "TL", "FM", "MH", "PW", "ZW", "BQ", "VG", "TC",
];

/** ISO 3166-1 alpha-2 country → ISO 4217 currency. Anything absent → USD. */
const MAP: Record<string, string> = {
  // Americas
  MX: "MXN", CO: "COP", AR: "ARS", CL: "CLP", PE: "PEN", BR: "BRL", UY: "UYU",
  PY: "PYG", BO: "BOB", CR: "CRC", GT: "GTQ", HN: "HNL", NI: "NIO", DO: "DOP",
  VE: "VES", CA: "CAD", JM: "JMD", TT: "TTD", BS: "BSD", BB: "BBD", BZ: "BZD",
  // Europe (non-euro)
  GB: "GBP", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK",
  HU: "HUF", RO: "RON", BG: "BGN", IS: "ISK", RS: "RSD", UA: "UAH", TR: "TRY",
  // Asia / Oceania
  JP: "JPY", KR: "KRW", CN: "CNY", HK: "HKD", TW: "TWD", SG: "SGD", MY: "MYR",
  TH: "THB", ID: "IDR", PH: "PHP", VN: "VND", IN: "INR", PK: "PKR", BD: "BDT",
  LK: "LKR", AU: "AUD", NZ: "NZD", IL: "ILS", AE: "AED", SA: "SAR", QA: "QAR",
  KZ: "KZT",
  // Africa
  ZA: "ZAR", NG: "NGN", EG: "EGP", KE: "KES", MA: "MAD",
};
for (const c of EUROZONE) MAP[c] = "EUR";
for (const c of DOLLARIZED) MAP[c] = BASE_CURRENCY;

/** Currency for a visitor's country (`x-vercel-ip-country`); unknown → USD. */
export function currencyForCountry(country: string | null | undefined): string {
  const code = country?.trim().toUpperCase() ?? "";
  return MAP[code] ?? BASE_CURRENCY;
}
