import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compile } from 'tailwindcss';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const twDir = path.resolve(__dirname, 'node_modules/tailwindcss');

function getAllFiles(dir, exts = ['.jsx', '.js', '.html']) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      if (item !== 'node_modules' && item !== 'dist') files = files.concat(getAllFiles(full, exts));
    } else if (exts.includes(path.extname(full))) {
      files.push(full);
    }
  }
  return files;
}

const files = getAllFiles(__dirname);
const candidates = new Set();
for (const f of files) {
  const content = fs.readFileSync(f, 'utf-8');
  const words = content.match(/[\w\-:\/\[\]%#.]+/g) || [];
  for (const w of words) candidates.add(w);
}

// Ensure essential utility classes are always compiled
const coreCandidates = [
  'bg-[#001F44]', 'bg-[#032D5B]', 'bg-[#0A1B30]', 'bg-[#D4AF37]', 'bg-[#C9A34A]',
  'text-[#001F44]', 'text-[#032D5B]', 'text-[#D4AF37]', 'text-[#C9A34A]',
  'border-[#001F44]', 'border-[#032D5B]', 'border-[#D4AF37]', 'border-[#C9A34A]',
  'hover:bg-[#032D5B]', 'hover:bg-[#001F44]', 'hover:bg-[#C9A34A]',
  'bg-slate-50', 'bg-slate-100', 'bg-slate-200', 'bg-slate-800', 'bg-slate-900',
  'text-slate-500', 'text-slate-600', 'text-slate-700', 'text-slate-800', 'text-slate-900',
  'rounded-lg', 'rounded-xl', 'rounded-2xl', 'shadow-sm', 'shadow-md', 'shadow-lg',
  'flex', 'grid', 'hidden', 'block', 'inline-flex', 'items-center', 'justify-between',
  'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'gap-4', 'gap-6',
  'p-4', 'p-6', 'px-4', 'py-2', 'py-3', 'px-6', 'w-full', 'max-w-7xl'
];
coreCandidates.forEach(c => candidates.add(c));

const customTokens = `
@import "tailwindcss";

@theme {
  --color-iitm-navy: #001F44;
  --color-iitm-navy-dark: #0A1B30;
  --color-iitm-navy-light: #032D5B;
  --color-iitm-gold: #D4AF37;
  --color-iitm-gold-dark: #C9A34A;
  --color-iitm-gold-light: #F3E5AB;
  --color-slate-50: #F8FAFC;
  --color-slate-100: #F1F5F9;
  --color-slate-200: #E2E8F0;
  --color-slate-300: #CBD5E1;
  --color-slate-400: #94A3B8;
  --color-slate-500: #64748B;
  --color-slate-600: #475569;
  --color-slate-700: #334155;
  --color-slate-800: #1E293B;
  --color-slate-900: #0F172A;
}

@layer base {
  body {
    background-color: #F8FAFC;
    color: #1E293B;
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
  }
  h1, h2, h3, h4, .font-heading {
    font-family: 'Poppins', 'Inter', system-ui, sans-serif;
  }
}

/* Custom Scrollbars */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #F1F5F9;
}
::-webkit-scrollbar-thumb {
  background: #CBD5E1;
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94A3B8;
}
`;

console.log(`[Tailwind Compiler] Scanning ${files.length} source files (${candidates.size} token candidates)...`);

const compiler = await compile(customTokens, {
  base: twDir,
  loadStylesheet: async (id, base) => {
    let file = id === 'tailwindcss' ? path.resolve(twDir, 'index.css') : path.resolve(base, id);
    if (!fs.existsSync(file)) file = path.resolve(twDir, id);
    if (!fs.existsSync(file) && !file.endsWith('.css')) file += '.css';
    return { base: path.dirname(file), content: fs.readFileSync(file, 'utf-8') };
  }
});

const compiledCss = compiler.build(Array.from(candidates));

const outputPath = path.resolve(__dirname, 'src/compiled.css');
fs.writeFileSync(outputPath, compiledCss, 'utf-8');
console.log(`[Tailwind Compiler] Successfully generated ${outputPath} (${compiledCss.length} bytes)`);
