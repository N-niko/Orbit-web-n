import { z } from "zod";
export const maxFileSize = 5 * 1024 * 1024;
export const maxPostFiles = 4;
export const fileTypes: Record<string,string> = {
 jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", txt: "text/plain", csv: "text/csv",
 doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
 ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip",
};
export const acceptedFiles = Object.keys(fileTypes).map(ext=>`.${ext}`).join(",");
export function fileMime(name: string) { return fileTypes[name.split(".").at(-1)?.toLowerCase() ?? ""]; }
export const reserveFileSchema = z.object({ id: z.uuid(), name: z.string().min(1).max(240).refine(name=>!/[\\/\x00-\x1f\x7f]/.test(name) && Boolean(fileMime(name)), "Choose a supported photo or document."), size: z.number().int().positive().max(maxFileSize, "Files must be 5 MB or smaller.") }).strict();
export const reservedFileSchema = z.object({ id: z.uuid(), name: z.string(), mime: z.string(), size: z.number(), path: z.string() });
export const fileInfoSchema = reservedFileSchema.extend({ pending: z.boolean() });
export function formatFileSize(size: number) { return size >= 1024*1024 ? `${(size/1024/1024).toFixed(1)} MB` : `${Math.max(1,Math.round(size/1024))} KB`; }
