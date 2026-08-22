import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const upload = resolve(root, "../upload");

const sources = {
  carros: ["marcas-carros.csv", "modelos-carro.csv"],
  motos: ["marcas-motos.csv", "modelos-moto.csv"],
  caminhoes: ["marcas-caminhao.csv", "modelos-caminhao.csv"],
};

function rows(text) {
  const [header, ...lines] = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const keys = header.split(";");
  return lines.filter(Boolean).map((line) => Object.fromEntries(line.split(";").map((value, index) => [keys[index], value.trim()])));
}

function brandName(value) {
  if (value.length <= 4) return value;
  return value.toLocaleLowerCase("pt-BR").replace(/(^|[\s/-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

const catalog = {};
for (const [type, [brandsFile, modelsFile]] of Object.entries(sources)) {
  const [brandsText, modelsText] = await Promise.all([
    readFile(resolve(upload, brandsFile), "utf8"),
    readFile(resolve(upload, modelsFile), "utf8"),
  ]);
  const modelsByBrand = Map.groupBy(rows(modelsText), (model) => model.IDMARCA);
  catalog[type] = rows(brandsText).map((brand) => ({
    code: brand.ID,
    name: brandName(brand.NOME),
    models: (modelsByBrand.get(brand.ID) || []).map((model) => ({ code: model.ID, name: model.NOME })),
  }));
}

await mkdir(resolve(root, "public/data"), { recursive: true });
await writeFile(resolve(root, "public/data/vehicle-catalog.json"), `${JSON.stringify(catalog)}\n`);
