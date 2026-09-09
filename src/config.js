import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carga .env sin dependencias externas
const envPath = path.join(RAIZ, '.env');
if (fs.existsSync(envPath)) {
  for (const linea of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i === -1) continue;
    const k = l.slice(0, i).trim();
    const v = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

export const cfg = {
  anthropicKey:   process.env.ANTHROPIC_API_KEY || '',
  uploadPostKey:  process.env.UPLOADPOST_API_KEY || '',
  uploadPostUser: process.env.UPLOADPOST_USER || '',
  geminiKey:      process.env.GEMINI_API_KEY || '',
  elevenKey:      process.env.ELEVENLABS_API_KEY || '',
  supabaseUrl:    process.env.SUPABASE_URL || '',
  supabaseKey:    process.env.SUPABASE_SERVICE_KEY || '',
  zona:           process.env.ZONA_HORARIA || 'America/Mexico_City',
  publicar:       String(process.env.PUBLICAR ?? 'true').toLowerCase() !== 'false',

  rutas: {
    master:     path.join(RAIZ, 'assets', 'libro_master.mp4'),
    referencia: path.join(RAIZ, 'assets', 'libro_referencia.png'),
    fuente:     path.join(RAIZ, 'assets', 'fuentes', 'cormorant.ttf'),
    musica:     path.join(RAIZ, 'assets', 'audio', 'fondo.mp3'),
    salidas:    path.join(RAIZ, 'salidas'),
    historial:  path.join(RAIZ, 'datos', 'historial.json'),
  },
};

export const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

/**
 * Fecha que se estampa en el video, en la zona horaria del usuario.
 *
 * MODO NOCTURNO: el workflow corre a las 9pm para que el video esté listo y se
 * publique después de medianoche, ya en el día siguiente. Por eso, si la hora
 * local pasó del mediodía, la fecha que se estampa es la de MAÑANA.
 *
 * Se usa el mediodía como corte, y no una suma fija de un día, porque el cron de
 * GitHub se retrasa hasta tres horas: unos días dispara a las 21:00 y otros ya
 * pasada la medianoche. Con este corte, ambos casos estampan la misma fecha.
 *
 *   21:00 del 9  → pasó del mediodía → estampa 10  ✓
 *   00:30 del 10 → antes del mediodía → estampa 10  ✓
 *
 * MODO_NOCTURNO=false lo desactiva (útil para pruebas manuales de tarde).
 */
export function hoy() {
  const nocturno = String(process.env.MODO_NOCTURNO ?? 'true').toLowerCase() !== 'false';

  const horaLocal = new Intl.DateTimeFormat('en-GB', {
    timeZone: cfg.zona, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date());                                   // HH:MM:SS

  // Si es de tarde/noche y el modo nocturno está activo, apuntamos a mañana
  const adelantar = nocturno && Number(horaLocal.slice(0, 2)) >= 12;
  const base = new Date(Date.now() + (adelantar ? 86400000 : 0));

  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: cfg.zona }).format(base); // YYYY-MM-DD
  const largo = new Intl.DateTimeFormat('es-MX', {
    timeZone: cfg.zona, day: 'numeric', month: 'long', year: 'numeric',
  }).format(base);

  // Hashtag de la fecha: #10deseptiembre
  const dia = new Intl.DateTimeFormat('es-MX', { timeZone: cfg.zona, day: 'numeric' }).format(base);
  const mes = new Intl.DateTimeFormat('es-MX', { timeZone: cfg.zona, month: 'long' }).format(base);
  const hashtagFecha = `#${dia}de${mes.toLowerCase()}`;

  return { iso: f, hora: horaLocal, largo: largo.toUpperCase(), hashtagFecha };
}
