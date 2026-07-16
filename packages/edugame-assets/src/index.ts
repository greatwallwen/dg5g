import manifest from '../asset-manifest.json';

export type EduGameAsset = {
  asset_id: string;
  type: string;
  domain: string;
  object: string;
  format: string;
  license: string;
  source?: string;
  tags: string[];
  allowed_usage: string[];
};

export const assetManifest = manifest as {
  schema: string;
  asset_pack: string;
  style?: string;
  source_policy?: string;
  assets: EduGameAsset[];
};

export function findAsset(assetId: string): EduGameAsset | undefined {
  return assetManifest.assets.find((asset) => asset.asset_id === assetId);
}

export function assetsByType(type: string): EduGameAsset[] {
  return assetManifest.assets.filter((asset) => asset.type === type);
}
