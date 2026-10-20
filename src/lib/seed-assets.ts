import { isProductionDeploy } from "@/lib/auth";
import { writeSeedAdAssetFile } from "@/lib/ad-assets-fs";
import type { PlatformData } from "@/lib/types";

export async function materializeSeedAdAssets(
  data: PlatformData,
): Promise<PlatformData> {
  if (isProductionDeploy()) return { ...data, adAssets: [] };
  const samples: Record<string, string> = {
    "shared/shared-compliance-notes.txt":
      "Shared Ads notes\n\n- No guaranteed funding language\n- SMS samples keep STOP\n- Keep entity libraries separate\n",
    "abstract/abstract-mca-brief.txt":
      "Abstract MCA brief\n\nTone: professional, clear CTA.\nOffer: MCA / working capital for qualified SMBs.\n",
    "ahava/ahava-tone-sheet.txt":
      "Ahava tone sheet\n\nWarm, human, capital with love — still compliance-safe.\n",
  };

  const adAssets = await Promise.all(
    (data.adAssets || []).map(async (asset) => {
      const contents =
        samples[asset.storagePath] ||
        `${asset.name}\n\nDemo marketing asset for ${asset.brandId || "shared"}.\n`;
      const relativeName = asset.storagePath.split("/").pop() || asset.originalName;
      const written = await writeSeedAdAssetFile({
        brandId: asset.brandId,
        relativeName,
        contents,
      });
      return {
        ...asset,
        storagePath: written.storagePath,
        sizeBytes: written.sizeBytes,
      };
    }),
  );

  return { ...data, adAssets };
}
