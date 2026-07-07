const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const manifestPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "version.json");
const signaturePath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, "version.sig");
const privateKeyPath = path.join(root, "hot_update_private_key.pem");
const publicKeyPath = path.join(root, "apps", "desktop", "hot_update_public_key.pem");

function ensureKeyPair() {
  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) return;
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  fs.writeFileSync(privateKeyPath, privateKey, { encoding: "utf8", mode: 0o600 });
  fs.mkdirSync(path.dirname(publicKeyPath), { recursive: true });
  fs.writeFileSync(publicKeyPath, publicKey, "utf8");
  console.log("Generated hot update key pair.");
  console.log("Keep hot_update_private_key.pem on your own machine. Do not upload it.");
  console.log("Rebuild EXE after the public key is generated or changed.");
}

ensureKeyPair();

const manifest = fs.readFileSync(manifestPath);
const privateKey = fs.readFileSync(privateKeyPath, "utf8");
const signature = crypto.sign("sha256", manifest, privateKey).toString("base64");
fs.writeFileSync(signaturePath, `${signature}\n`, "utf8");
console.log(`Signed ${path.relative(root, manifestPath)} -> ${path.relative(root, signaturePath)}`);
