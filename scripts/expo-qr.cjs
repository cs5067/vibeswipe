/* eslint-disable @typescript-eslint/no-require-imports */
const QRCode = require("../mobile/node_modules/qrcode-terminal/vendor/QRCode");
const levels = require("../mobile/node_modules/qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel");
const sharp = require("sharp");
const [url, output = "/tmp/vibeswipe-expo-go-qr.png"] = process.argv.slice(2);
if (!url?.startsWith("exp://")) throw new Error("Pass the running Expo server's exp:// URL.");
const qr = new QRCode(-1, levels.M);
qr.addData(url);
qr.make();
const size = qr.getModuleCount();
const pixels = [];
for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
  if (qr.isDark(row, column)) pixels.push(`<rect x="${column + 4}" y="${row + 4}" width="1" height="1"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(size + 8) * 10}" height="${(size + 8) * 10}" viewBox="0 0 ${size + 8} ${size + 8}"><rect width="100%" height="100%" fill="white"/><g fill="black">${pixels.join("")}</g></svg>`;
sharp(Buffer.from(svg)).png().toFile(output).then(() => console.log(`${url}\n${output}`)).catch((error) => {
  console.error(error.message); process.exitCode = 1;
});
