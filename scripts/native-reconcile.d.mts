export function reconcileNative(root: string, profile: string, acknowledge: boolean): Promise<{ status: string; currentDigest: string; reconciled: unknown[]; note: string }>;
