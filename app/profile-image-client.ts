const allowedProfileTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateProfileImage(file: File) {
  if (!allowedProfileTypes.has(file.type)) return "Selecione uma imagem JPG, PNG ou WebP.";
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) return "A imagem original deve ter no máximo 10 MB.";
  return "";
}

export function createProfilePreview(file: File) {
  return URL.createObjectURL(file);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(source); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(source); reject(new Error("Não foi possível ler a imagem.")); };
    image.src = source;
  });
}

async function optimizeProfileImage(file: File) {
  const image = await loadImage(file);
  const size = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - size) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - size) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 640;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem.");
  context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 640, 640);
  return canvas.toDataURL("image/webp", 0.84);
}

export async function uploadProfileImage(file: File) {
  const validationError = validateProfileImage(file);
  if (validationError) throw new Error(validationError);
  const dataUrl = await optimizeProfileImage(file);
  const response = await fetch("/api/profile-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataUrl, filename: file.name }),
  }).catch(() => null);
  const result = response ? await response.json().catch(() => ({})) as { url?: string; error?: string } : {};
  if (!response?.ok || !result.url) throw new Error(result.error || "Não foi possível enviar a foto.");
  return result.url;
}
