#!/usr/bin/env node
/**
 * Pipeline diario: poema → video → TikTok → registro en Supabase
 *
 *   node src/index.js            genera y publica
 *   node src/index.js --dry-run  genera pero NO publica
 */
import fs from 'node:fs';
import path from 'node:path';
import { cfg, log, hoy } from './config.js';
import { generarPoema } from './poema.js';
import { renderizar } from './render.js';
import { publicarEnTikTok, caption, hashtagsDe } from './publicar.js';
import { registrarPoema, marcarPublicado, marcarFallido } from './supabase.js';

const seco = process.argv.includes('--dry-run') || !cfg.publicar;

async function main() {
  const { iso, hora, largo, hashtagFecha } = hoy();
  log(`━━━ Poema del día · ${largo} ━━━`);

  // 1) El poema
  log('✍️  Pidiendo el poema del día…');
  const poema = await generarPoema();
  console.log('\n' + poema.versos.map(v => '   ' + v).join('\n') + '\n');
  log(`   (tema: ${poema.tema})`);

  // 2) El video
  const video = await renderizar(poema);

  // 3) El texto de la publicación
  const hashtags = hashtagsDe();
  const texto = caption(poema, largo, hashtags, hashtagFecha);

  // Se guarda junto al video, para copiar y pegar al publicar a mano.
  // Viaja dentro del artefacto de GitHub Actions.
  const rutaTexto = path.join(cfg.rutas.salidas, `caption_${iso}.txt`);
  fs.writeFileSync(rutaTexto, texto + '\n', 'utf8');
  log(`📝 Caption guardado: ${path.basename(rutaTexto)}`);

  // 4) Registro en Supabase — antes de publicar, para que quede
  //    constancia incluso si la publicación falla
  const sinPublicar = seco || !cfg.uploadPostKey || !cfg.uploadPostUser;
  const filaId = await registrarPoema({
    fecha: iso,
    hora,
    poema: poema.versos.join('\n'),
    versos: poema.versos,
    tema: poema.tema,
    modelo: poema.modelo,
    caption: texto,
    hashtags,
    estado: seco ? 'prueba' : 'pendiente',
  });

  // 5) Publicación
  if (seco) {
    log('🧪 Modo prueba: NO se publica. El video quedó en la carpeta "salidas".');
    console.log('\n--- Texto que se publicaría ---\n' + texto + '\n');
    return { video, iso };
  }

  if (sinPublicar) {
    log('ℹ️  Sin llaves de Upload-Post: el video quedó listo pero NO se publicó.');
    log('   Para automatizar la publicación, agrega UPLOADPOST_API_KEY y');
    log('   UPLOADPOST_USER a los Secrets del repositorio.');
    console.log('\n--- Texto para publicar a mano ---\n' + texto + '\n');
    return { video, iso };
  }

  try {
    const r = await publicarEnTikTok(video, texto);
    await marcarPublicado(filaId, {
      tiktok_url:     r?.tiktok_url || r?.url || r?.results?.tiktok?.url || null,
      tiktok_post_id: r?.post_id || r?.results?.tiktok?.post_id || null,
      request_id:     r?.request_id || null,
    });
    log('🎉 Terminado.');
  } catch (e) {
    await marcarFallido(filaId, e.message);
    throw e;
  }

  return { video, iso };
}

main().catch(e => {
  console.error('\n❌ FALLÓ:', e.message);
  process.exitCode = 1;   // salida limpia; process.exit() rompe en Windows
});
