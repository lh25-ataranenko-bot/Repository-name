export type Fuel = "petrol" | "diesel" | "hybrid" | "electric";
export type CategoryKey = "economy" | "dynamics" | "reliability" | "comfort" | "safety" | "practicality" | "tco";
export type Scores = Record<CategoryKey, number | null>;

export interface Issue { part: string; frequency: "часто" | "іноді" | "рідко"; cost: number }

export interface Car {
  slug: string;
  brand: string;
  model: string;
  generation: string;
  name: string;
  year_from: number | null;
  year_to: number | null;
  year_ref: number | null;
  body: string;
  fuel: Fuel;
  engine_code: string | null;
  displacement: number | null;
  hp: number | null;
  torque: number | null;
  transmission: string | null;
  trans_type: string;
  drive: "FWD" | "RWD" | "AWD";
  acc: number | null;
  vmax: number | null;
  cons_pass: number | null;
  cons_real: number | null;
  tank: number | null;
  battery: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  wheelbase: number | null;
  clearance: number | null;
  trunk: number | null;
  ncap: number | null;
  ncap_year: number | null;
  airbags: number | null;
  assists: string[];
  comfort: number | null;
  reliability: number | null;
  reliability_confidence: string | null;
  maint_per_year: number | null;
  repair_per_year: number | null;
  depreciation: number | null;
  liquidity: string | null;
  price: number | null;
  source: string | null;
  updated_at: string | null;
  status: "verified" | "partial" | "unverified";
  issues: Issue[];
  scores: Scores;
  cost_per_100km: number | null;
  range_km: number | null;
  tco_5y: number | null;
  /** Present when a production year was requested */
  for_year?: number;
  price_for_year?: number | null;
  /** Detail endpoint only */
  years?: number[];
  price_by_year?: Record<string, number | null>;
}

export interface Facets { brands: Record<string, string[]>; year_min: number | null; year_max: number | null }

export interface Meta {
  fuel: Record<string, string>;
  body: Record<string, string>;
  drive: Record<string, string>;
  trans: Record<string, string>;
  assists: Record<string, string>;
  status: Record<string, string>;
  categories: [CategoryKey, string][];
  presets: Record<string, { name: string; w: Record<CategoryKey, number> }>;
  env: Env;
  current_year: number;
}

export interface Env { petrol: number; diesel: number; kwh: number; rate: number; km: number; years: number; other: number }

export interface CompareRow { label: string; values: (string | null)[]; best: number[]; same: boolean }
export interface CompareResult {
  cars: Car[];
  table: { group: string; rows: CompareRow[] }[];
  summary: { slug: string; score: number | null; leads: string[]; weak: string[]; tco_5y: number | null }[];
  winner: string;
}

export interface TcoNumbers {
  P: number; F: number; M: number; R: number; I: number; O: number; S: number; C: number;
  credit: { principal: number; monthly_payment: number; interest_total: number; interest_in_period: number; balance_at_sale: number } | null;
  depreciation: number; total: number; per_month: number; per_km: number; years: number; km_per_year: number;
}
export interface TcoInputs { price: number | null; cons: number | null; maint: number | null; repair: number | null; ins: number | null; dep_pct: number | null }
export interface TcoResponse {
  env: Env;
  results: { slug: string; name: string; defaults: TcoInputs; consumption_real: boolean; unit: string; year: number | null; year_ref: number | null; years: number[]; result: TcoNumbers | null }[];
  comparison: { cheapest: string; most_expensive: string; difference: number } | null;
  missing: string[];
}

export interface Reason { kind: "plus" | "minus" | "note"; text: string }
export interface RatingResponse {
  weights: Record<CategoryKey, number>;
  ranked: { car: Car; score: number | null; used: number; reasons: Reason[] }[];
  matched: number;
  excluded: { slug: string; name: string; reasons: string[] }[];
  excluded_total: number;
}

export interface CheckResponse {
  car: { slug: string; name: string; price: number | null; year_ref: number | null };
  vin: { vin: string; maker: string | null; model_year: number | null; errors: string[]; notes: string[] } | null;
  market: { value: number; low: number; high: number; expected_km: number; mileage_adj: number } | null;
  verdict: { level: "good" | "warn" | "bad"; title: string; text: string; diff_pct: number } | null;
  warnings: string[];
  checklist: { general: string[]; specific: string[]; issues: string[]; questions: string[] };
  disclaimer: string;
}

export interface User { id: number; email: string; name: string; role: "user" | "editor" | "admin"; email_verified: boolean }

export interface GarageCar {
  id: number; name: string; start_km: number;
  modification: { slug: string; name: string } | null;
  total_uah: number; driven_km: number; current_km: number; per_km_uah: number | null;
  by_type: Record<string, number>;
  entries: { id: number; date: string; type: string; cost_uah: number; km: number; note: string }[];
}

export interface TreeBrand {
  brand: string;
  models: { model: string; generations: { generation: string; modifications: { slug: string; name: string }[] }[] }[];
}
