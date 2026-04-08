import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

export interface ReferenceImage {
  data: string;
  mediaType: "image/png" | "image/jpeg";
}

const ASSETS_DIR = resolve(process.cwd(), "../../attached_assets");

function loadImage(relPath: string): ReferenceImage | null {
  const fullPath = join(ASSETS_DIR, relPath);
  if (!existsSync(fullPath)) {
    console.warn(`[ref-images] missing: ${fullPath}`);
    return null;
  }
  const mediaType: ReferenceImage["mediaType"] = relPath.endsWith(".png")
    ? "image/png"
    : "image/jpeg";
  const data = readFileSync(fullPath).toString("base64");
  return { data, mediaType };
}

let _physicalImages: ReferenceImage[] | null = null;
let _mobileImages: ReferenceImage[] | null = null;

/**
 * Circular Comfort GO hardware face + CRA-Compliant controller panels.
 * Used as visual style reference for physical_product visualizations.
 */
export function getPhysicalProductReferenceImages(): ReferenceImage[] {
  if (_physicalImages) return _physicalImages;
  const files = [
    "image_1775672811477.png", // circular Comfort GO / Magnafree pump face
    "image_1775672803760.png", // CRA-compliant rectangular controller
    "image_1775672859648.png", // CRA controller with Face ID biometrics
  ];
  _physicalImages = files
    .map((f) => loadImage(f))
    .filter(Boolean) as ReferenceImage[];
  console.log(
    `[ref-images] physical_product: ${_physicalImages.length}/${files.length} images loaded`,
  );
  return _physicalImages;
}

/**
 * Grundfos GO app screenshots.
 * Used as visual style reference for mobile_app visualizations.
 */
export function getMobileAppReferenceImages(): ReferenceImage[] {
  if (_mobileImages) return _mobileImages;
  const files = [
    "grundfos-go-photos/Screenshot_20260408_173129.jpg",
    "grundfos-go-photos/Screenshot_20260408_173125.jpg",
    "grundfos-go-photos/Screenshot_20260408_173120.jpg",
    "grundfos-go-photos/Screenshot_20260408_173133.jpg",
  ];
  _mobileImages = files
    .map((f) => loadImage(f))
    .filter(Boolean) as ReferenceImage[];
  console.log(
    `[ref-images] mobile_app: ${_mobileImages.length}/${files.length} images loaded`,
  );
  return _mobileImages;
}
