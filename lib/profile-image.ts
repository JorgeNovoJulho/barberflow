import sharp from "sharp";
import { profileImageLimit } from "./profile-image-limits";

const maxPixels = 40_000_000;
const maxSide = 8192;

function validDimensions(width: number, height: number) {
  return width > 0 && height > 0 && width <= maxSide && height <= maxSide && width * height <= maxPixels;
}

function bitmap(bytes: Buffer) {
  if (bytes.length < 54) throw new Error("BMP inválido.");
  const start = bytes.readUInt32LE(10);
  const header = bytes.readUInt32LE(14);
  const width = bytes.readInt32LE(18);
  const signedHeight = bytes.readInt32LE(22);
  const height = Math.abs(signedHeight);
  const bits = bytes.readUInt16LE(28);
  if (header < 40 || start < 14 + header || bytes.readUInt16LE(26) !== 1
    || ![24, 32].includes(bits) || bytes.readUInt32LE(30) !== 0) {
    throw new Error("Use um BMP sem compressão de 24 ou 32 bits.");
  }
  if (!validDimensions(width, height)) throw new Error("A imagem ultrapassa o limite de dimensões.");
  const channels = bits / 8;
  const stride = Math.ceil(width * channels / 4) * 4;
  if (start + stride * height > bytes.length) throw new Error("O arquivo BMP está incompleto.");
  const pixels = Buffer.allocUnsafe(width * height * 3);
  for (let y = 0; y < height; y++) {
    const row = start + (signedHeight > 0 ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const source = row + x * channels;
      const destination = (y * width + x) * 3;
      pixels[destination] = bytes[source + 2];
      pixels[destination + 1] = bytes[source + 1];
      pixels[destination + 2] = bytes[source];
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } });
}

export async function optimizeProfileImage(bytes: Buffer, kind: "avatar" | "banner") {
  if (bytes.length > profileImageLimit) throw new Error("O arquivo ultrapassa 10 MB.");
  const bmp = bytes[0] === 0x42 && bytes[1] === 0x4d;
  const image = bmp ? bitmap(bytes) : sharp(bytes, { limitInputPixels: maxPixels, pages: 1 });
  if (!bmp) {
    const { format, width, height, pageHeight, compression } = await image.metadata();
    if (!format || !["jpeg", "png", "webp", "heif", "gif"].includes(format) || (format === "heif" && compression !== "av1")) {
      throw new Error("Formato não aceito. Use JPG, PNG, WebP, AVIF, GIF ou BMP.");
    }
    if (!width || !height || !validDimensions(width, pageHeight ?? height)) {
      throw new Error("A imagem ultrapassa o limite de dimensões.");
    }
  }
  const output = await image.rotate().resize(kind === "avatar" ? 384 : 1440, kind === "avatar" ? 384 : 720,
    { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  if (output.length > 2 * 1024 * 1024) throw new Error("A imagem otimizada excedeu o limite de armazenamento.");
  return output;
}
