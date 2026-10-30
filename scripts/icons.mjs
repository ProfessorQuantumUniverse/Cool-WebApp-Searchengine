// Renders the PNG icons from the brand mark: node scripts/icons.mjs
import sharp from 'sharp';

const mark = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="${rx}" fill="#1f4fd8"/>
    <g fill="none" stroke="#fff" stroke-linecap="round">
        <circle cx="14" cy="14" r="7.5" stroke-width="2.2"/>
        <ellipse cx="14" cy="14" rx="3.2" ry="7.5" stroke-width="1.6"/>
        <path d="M6.5 14h15" stroke-width="1.6"/>
        <path d="M19.6 19.6 25 25" stroke-width="3.2"/>
    </g>
</svg>`;

const root = new URL('../', import.meta.url);
const render = (svg, size, file) => sharp(Buffer.from(svg), { density: 72 * size / 32 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(new URL(file, root).pathname.replace(/^\/(\w:)/, '$1'));

// iOS rounds the corners itself, so the touch icon is full-bleed.
await render(mark(0), 180, 'apple-touch-icon.png');
await render(mark(8), 32, 'favicon-32.png');
console.log('icons written');
