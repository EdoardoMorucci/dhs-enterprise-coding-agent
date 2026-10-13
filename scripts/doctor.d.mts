export interface ModelListingResult {
  ready: boolean;
  detail: string;
}

export function probeModelListing(config: { endpoint: string; model: string }, apiKey: string): Promise<ModelListingResult>;

export function doctor(root: string, profile: string): Promise<{
  ready: boolean;
  model: ModelListingResult;
  qualification: string;
  runtime?: { ready: boolean; version: string };
  compiled?: boolean;
  workspace?: boolean;
  docker?: { ready: boolean; detail: string };
}>;
