import fs from 'node:fs';
import path from 'node:path';
import { cfg, log } from './config.js';

const API = 'https://api.upload-post.com/api';

/**
 * Hashtags FIJOS de la cuenta. Composición deliberada:
 *   #poesia            amplio de categoría, da volumen
 *   #poemascortos      de nicho, con intención de búsqueda real
 *   #poesiaenespanol   acota al público que entiende el contenido
 *   #tintaypapel       de marca: hoy no lo usa nadie, en unos meses es
 *                      el catálogo de la cuenta
 *
 * A estos se suman DOS que cambian cada día: el del tema del poema (lo genera
 * el modelo) y el de la fecha.
 *
 * NO agregar #fyp, #parati, #viral ni #foryou: los usa todo el mundo y no
 * posicionan en ningún lado.
 */
const HASHTAGS_FIJOS = ['#poesia', '#poemascortos', '#poesiaenespanol', '#tintaypapel'];

/** Los hashtags fijos de la cuenta */
export function hashtagsDe() {
  return [...HASHTAGS_FIJOS];
}

/**
 * Construye el texto que acompaña al video.
 *
 * Estructura: versos · pregunta · hashtags. La pregunta va porque los
 * comentarios son la señal más fuerte del algoritmo, y una que salga del poema
 * genera mucho más que un "¿te gustó?".
 */
export function caption(poema, fechaLarga, hashtags = hashtagsDe(), hashtagFecha = '') {
  const etiquetas = [...hashtags];
  if (poema.hashtagTema) etiquetas.splice(2, 0, poema.hashtagTema);
  if (hashtagFecha) etiquetas.push(hashtagFecha);

  const partes = [poema.versos.join('\n')];
  if (poema.pregunta) partes.push(poema.pregunta);
  partes.push(etiquetas.join(' '));

  let txt = partes.join('\n\n');
  if (txt.length > 2100) txt = txt.slice(0, 2100);
  return txt;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function armarFormulario(rutaVideo, texto) {
  const form = new FormData();
  form.append('user', cfg.uploadPostUser);
  form.append('platform[]', 'tiktok');
  form.append('title', texto);
  form.append(
    'video',
    new Blob([fs.readFileSync(rutaVideo)], { type: 'video/mp4' }),
    path.basename(rutaVideo)
  );

  // ── Ajustes específicos de TikTok ────────────────────────
  form.append('post_mode', 'DIRECT_POST');           // publica directo, no a borradores
  form.append('privacy_level', 'PUBLIC_TO_EVERYONE');
  form.append('disable_comment', 'false');
  form.append('disable_duet', 'false');
  form.append('disable_stitch', 'false');
  form.append('brand_content_toggle', 'false');
  form.append('brand_organic_toggle', 'false');
  // TikTok exige declarar el contenido generado con IA
  form.append('is_aigc', String(process.env.ES_CONTENIDO_IA ?? 'true'));
  form.append('async_upload', 'true');

  return form;
}

/** Consulta el estado de una subida asíncrona */
async function consultarEstado(requestId) {
  for (let i = 0; i < 20; i++) {
    await sleep(9_000);
    try {
      const r = await fetch(`${API}/uploadposts/status?request_id=${encodeURIComponent(requestId)}`, {
        headers: { Authorization: `Apikey ${cfg.uploadPostKey}` },
      });
      const d = await r.json();
      const estado = JSON.stringify(d);
      if (/completed|success|published|done/i.test(estado) && !/pending|processing/i.test(estado)) {
        log(`✅ TikTok confirmó la publicación.`);
        return d;
      }
      if (/failed|error/i.test(estado)) {
        log(`⚠️  El estado reporta un problema: ${estado.slice(0, 400)}`);
        return d;
      }
      if (i % 3 === 0) log(`   … procesando en TikTok (${(i + 1) * 9}s)`);
    } catch { /* seguimos intentando */ }
  }
  log('ℹ️  La subida sigue procesándose. Revisa tu perfil de TikTok en unos minutos.');
}

/**
 * Sube el video a TikTok a través de Upload-Post.
 * Docs: https://docs.upload-post.com  ·  Requiere plan de pago (TikTok no está en el gratis)
 */
export async function publicarEnTikTok(rutaVideo, texto) {
  if (!cfg.uploadPostKey)  throw new Error('Falta UPLOADPOST_API_KEY en el archivo .env');
  if (!cfg.uploadPostUser) throw new Error('Falta UPLOADPOST_USER en el archivo .env');

  let ultimoError;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      log(`📤 Subiendo a TikTok (intento ${intento}/3)…`);
      const r = await fetch(`${API}/upload`, {
        method: 'POST',
        headers: { Authorization: `Apikey ${cfg.uploadPostKey}` },
        body: armarFormulario(rutaVideo, texto),
      });

      const cuerpo = await r.text();

      if (r.ok) {
        let d = {};
        try { d = JSON.parse(cuerpo); } catch { /* respuesta no-JSON */ }
        log(`✅ Subida aceptada: ${cuerpo.slice(0, 250)}`);
        if (d.request_id) await consultarEstado(d.request_id);
        return d;
      }

      ultimoError = new Error(`Upload-Post respondió ${r.status}: ${cuerpo.slice(0, 400)}`);
      // Los 4xx (llave mala, plan sin TikTok, perfil inexistente) no se arreglan reintentando
      if (r.status >= 400 && r.status < 500 && r.status !== 429) throw ultimoError;
    } catch (e) {
      ultimoError = e;
      if (intento === 3 || /respondió 4(0[0-9]|1[0-8])/.test(e.message)) break;
      const espera = intento * 20_000;
      log(`⚠️  ${e.message}\n   Reintentando en ${espera / 1000}s…`);
      await sleep(espera);
    }
  }
  throw ultimoError;
}

/**
 * Utilidad: genera el link para conectar tu cuenta de TikTok a un perfil.
 *   node -e "import('./src/publicar.js').then(m=>m.linkDeConexion())"
 */
export async function linkDeConexion(usuario = cfg.uploadPostUser) {
  // 1) crea el perfil (si ya existe, la API lo indicará y no pasa nada)
  await fetch(`${API}/uploadposts/users`, {
    method: 'POST',
    headers: { Authorization: `Apikey ${cfg.uploadPostKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usuario }),
  }).then(r => r.text()).then(t => log('Perfil:', t.slice(0, 200)));

  // 2) genera el link de autorización
  const r = await fetch(`${API}/uploadposts/users/generate-jwt`, {
    method: 'POST',
    headers: { Authorization: `Apikey ${cfg.uploadPostKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usuario, platforms: ['tiktok'], language: 'es' }),
  });
  const d = await r.json();
  if (d.access_url) {
    console.log('\n🔗 Abre este link en tu navegador y conecta tu cuenta de TikTok:\n');
    console.log('   ' + d.access_url + '\n');
    console.log('   (el link vence en 1 hora)\n');
  } else {
    console.log(JSON.stringify(d, null, 2));
  }
  return d;
}
