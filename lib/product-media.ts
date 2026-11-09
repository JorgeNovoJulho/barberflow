export const productPhotoBucket = "barberflow-product-photos";
export const productVideoBucket = "barberflow-product-videos";
export const productMediaSlots = ["foto-1", "foto-2", "foto-3", "foto-4", "foto-5", "video"] as const;
export const productImageTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const productVideoTypes = ["video/mp4", "video/webm"];
export const productImageLimit = 5 * 1024 * 1024;
export const productVideoLimit = 20 * 1024 * 1024;
