import { createR2DeletePresignedUrl } from "@/lib/r2-presign";

function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

function getR2Config() {
  const accountId = envValue("R2_ACCOUNT_ID");
  const accessKeyId = envValue("R2_ACCESS_KEY_ID");
  const secretAccessKey = envValue("R2_SECRET_ACCESS_KEY");
  const bucketName = envValue("R2_BUCKET_NAME");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

export async function deleteR2Objects(objectKeys: string[]) {
  const uniqueKeys = [...new Set(objectKeys.map((key) => key.trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) return 0;

  const r2Config = getR2Config();
  if (!r2Config) throw new Error("R2 delete is not configured");

  await Promise.all(
    uniqueKeys.map(async (key) => {
      const deleteUrl = await createR2DeletePresignedUrl({ ...r2Config, key });
      const res = await fetch(deleteUrl, { method: "DELETE" });

      if (!res.ok && res.status !== 404) {
        const message = await res.text().catch(() => "");
        throw new Error(`Cannot delete R2 object ${key}: ${res.status}${message ? ` ${message}` : ""}`);
      }
    }),
  );

  return uniqueKeys.length;
}
