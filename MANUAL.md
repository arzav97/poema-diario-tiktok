# Manual · Automatizar una cuenta de video diario

Cómo montar una automatización que publique un video nuevo cada día en redes
sociales, sin intervención manual y a costo casi cero.

**Cómo leer este manual.** Todo lo que sigue es una receta genérica, aplicable a
cualquier cuenta de contenido diario: poesía, frases, datos curiosos, recetas,
citas históricas, lo que sea. Donde hace falta un valor concreto, aparece el
ejemplo del proyecto con el que se escribió esto — una cuenta de poemas — marcado
así:

> **Ejemplo (poema-diario):** los valores reales que se usaron ahí.

Los valores del ejemplo **no se copian, se recalculan**. Cada proyecto tiene su
propia plantilla, sus propias coordenadas y su propio público.

Escrito después de construirlo, no antes. Las trampas están documentadas porque
costaron tiempo, y las decisiones tienen su razón anotada para que el yo del
futuro no las deshaga por accidente.

**No cubre** cómo instalar Git, Node o VS Code. Eso ya lo tienes en el
`CURSO-COMPLETO.md` del workshop.

---

# Parte 1 · La idea de fondo

## Lo que no cambia, se hace una vez

Este es el principio que sostiene todo el proyecto, y es lo único que de verdad
hay que entender.

El primer instinto al montar una cuenta de contenido diario es generar cada
video con IA. Es caro, lento, e inconsistente: cada día sale distinto y algunos
días sale mal.

Aquí se hace al revés. **El video del libro se generó UNA vez** y se guardó como
plantilla. Cada mañana solo cambia el texto que se dibuja encima. Consecuencias:

| | Regenerar cada día | Plantilla fija |
|---|---|---|
| Costo diario | Créditos de IA de video | $0 |
| Tiempo de render | Minutos | ~30 segundos |
| Consistencia visual | Cada día distinto | Idéntica siempre |
| Puntos de fallo | Muchos | Uno (la API de texto) |

**Cómo aplicarlo a otro proyecto:** identifica qué parte de tu contenido es
constante y cuál varía. Casi siempre lo que varía es solo texto o una imagen
pequeña. Todo lo demás se genera una vez.

## No hay IA editando el video

Vale la pena decirlo claro porque es contraintuitivo: **ffmpeg no es IA.** Es un
programa de edición de video de línea de comandos, libre y gratuito, de los años
noventa. Es determinista — con la misma entrada da exactamente el mismo
resultado siempre.

La única IA de video fue Veo, y solo para crear la plantilla.

## Los cuatro pasos

```
1. Gemini escribe el poema, evitando temas ya usados
2. ffmpeg dibuja el poema sobre la plantilla y mezcla la música
3. Upload-Post publica el mp4 en TikTok        ← opcional
4. Supabase guarda el registro para consultarlo después
```

Los pasos 3 y 4 son prescindibles. Si Supabase está caído, el video igual se
genera. Si faltan las llaves de publicación, el video igual se genera y queda
guardado. **Nada de lo accesorio puede tumbar lo esencial** — eso está codificado
a propósito, no es casualidad.

---

# Parte 2 · Anatomía del proyecto

```
poema-diario-tiktok/
├─ .github/workflows/poema-diario.yml   El cron y los pasos de CI
├─ src/
│  ├─ config.js      Lee .env sin dependencias, rutas, fecha/hora local
│  ├─ poema.js       Temas, prompt, cascada de modelos, anti-repetición
│  ├─ render.js      Composición del video con ffmpeg
│  ├─ publicar.js    Upload-Post → TikTok
│  ├─ supabase.js    Registro por API REST
│  ├─ binarios.js    Localiza ffmpeg/ffprobe aunque no estén en PATH
│  └─ index.js       Orquesta los cuatro pasos
├─ assets/
│  ├─ libro_master.mp4        LA PLANTILLA. El archivo más importante.
│  ├─ audio/fondo.mp3         Música, normalizada a -18 LUFS
│  ├─ fuentes/cormorant.ttf   Tipografía
│  └─ originales/             Clips crudos y plantillas anteriores
├─ datos/historial.json       Temas usados (anti-repetición)
├─ salidas/                   Videos generados (en .gitignore)
└─ Docs/                      Esquema SQL y guías
```

**El archivo crítico es `assets/libro_master.mp4`.** Cambiarlo cambia todos los
videos futuros. Es el único punto donde se toca el diseño visual.

---

# Parte 3 · Crear la plantilla con IA de video

Esta es la parte que más créditos y más intentos costó. Seis generaciones, unos
400 puntos de Google Flow. Lo que sigue es lo aprendido.

## Herramienta y configuración

Google Flow (`labs.google/fx/tools/flow`), modelo **Veo 3.1**.

| Ajuste | Valor | Por qué |
|---|---|---|
| Relación de aspecto | 9:16 | Vertical nativo. Si sale 16:9 hay que recortar y se pierde calidad |
| Cantidad | x1 | Cada generación cuesta; x2 duplica el gasto por intento |
| Modelo | Quality para el definitivo, Fast para probar | Quality = 100 puntos |
| Confirmar antes de generar | Siempre | Con crédito limitado, no quieres modo automático |
| Marca de agua visible | **Desactivada** | Ajustes → Media Watermark |

Sobre la marca de agua: desde agosto 2026 Google permite apagar la marca visible
con un interruptor. **SynthID invisible y los metadatos C2PA permanecen siempre** y
no se pueden quitar. No importa: el pipeline ya declara `is_aigc=true` a TikTok.

Antes existía un filtro `delogo` para tapar el rombo. Ya no se usa, y mejor:
`delogo` siempre deja un parche borroso.

## Los seis defectos que aparecieron, en orden

Cada intento arregló el anterior e inventó uno nuevo. Esta es la lista, y es lo
más valioso de este capítulo:

1. **Pliegue en V.** Al pedir que el libro abierto se levantara, se cerraba en V
   a media rotación. No es desobediencia: **levantar un libro abierto SIEMPRE pasa
   por una V**, es física. La lección: no pidas cosas físicamente imposibles;
   mueve la cámara en vez del objeto.
2. **La portada se despega y desaparece.** Se soltaba del lomo, se deslizaba al
   borde del cuadro y se desvanecía.
3. **Texto escrito en la cara interior de la portada.** La instrucción decía
   "páginas en blanco", y técnicamente la portada no es una página. Hay que
   nombrarla explícitamente.
4. **Una hoja se voltea sola** a media toma, después de la apertura.
5. **La cámara rota sobre su eje** al subir, y el libro termina horizontal con el
   pliegue cruzando la pantalla. Pasar de frontal a cenital deja ambigua la
   rotación final y el modelo la resuelve girando.
6. **Doble pasta y encuadre descentrado**, además de que la cámara nunca subió.

Y el séptimo, el que finalmente se aceptó: **manuscrito impreso en las páginas**.
Ese no se resolvió regenerando sino en el render (ver Parte 4).

## Reglas de prompting para video

**Los prompts largos empeoran el resultado.** Cada restricción nueva le quita
atención a otra. Se llegó a un prompt con siete reglas numeradas y el resultado
fue peor que uno de la mitad de largo.

**El estado final pesa más que la trayectoria.** Describir el último cuadro como
una fotografía fija —"el pliegue es una línea vertical al centro, la página
izquierda ocupa la mitad izquierda"— funciona mejor que describir el movimiento.

**Las primeras líneas pesan más que las últimas.** La instrucción central va
arriba, no enterrada entre la descripción de la luz y el polvo.

**Da una referencia reconocible.** "Como un libro abierto sobre un atril"
funciona mejor que la descripción geométrica equivalente.

**Enumera las formas de fallar.** No basta "no se despegue": hay que decir
`detach, slide away, drift to the edge, shrink, disappear`. Cada verbo cubre un
modo de error distinto.

**El inglés obedece mejor las negaciones.** Veo entiende español, pero las
instrucciones negativas ("sin cortes", "sin texto") se respetan más en inglés.

**Sube una imagen de referencia** como ingrediente. Mejora mucho la fidelidad a
la composición que quieres.

## Antes de gastar créditos: intenta cortarlo en post

**Muchos defectos se arreglan con tijeras, no con créditos.** Si el defecto dura
menos de un segundo y cae en una zona prescindible, se corta:

```bash
ffmpeg -y -i entrada.mp4 -filter_complex "\
  [0:v]trim=0:1.05,setpts=PTS-STARTPTS,fps=30[a];\
  [0:v]trim=1.55:6.05,setpts=PTS-STARTPTS,fps=30[b];\
  [a][b]xfade=transition=fade:duration=0.22:offset=0.83[v]" \
  -map "[v]" -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p salida.mp4
```

Esto quitó, en un mismo clip, el texto de la portada y la hoja que se volteaba.
Cero créditos.

**Cómo auditar un clip cuadro por cuadro** — el hábito que hizo la diferencia:

```bash
# Tira de contactos con marca de tiempo en centésimas
ffmpeg -y -i clip.mp4 -vf "fps=3,scale=200:-1,\
  drawtext=text='%{eif\:(n/3)*100\:d}':fontsize=15:fontcolor=yellow:x=4:y=4,\
  tile=6x4" -frames:v 1 tira.png
```

Ojo: `tile=` necesita `-frames:v 1` o ffmpeg falla con
"Could not get frame filename number 2".

## Convertir el clip en plantilla

**No uses `scripts/integrar-clip.sh` tal cual.** Mete un fundido a negro al final,
y si después congelas el último cuadro, congelas el negro. Pasó.

El comando correcto:

```bash
ffmpeg -y -i "<clip de Flow>" -filter_complex "\
  [0:v]trim=0:2.6,setpts=PTS-STARTPTS[a];\
  [0:v]trim=2.6:8.0,setpts=(PTS-STARTPTS)/1.85[b];\
  [a][b]concat=n=2:v=1:a=0,\
  scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,\
  fade=t=in:st=0:d=1.0:color=black,tpad=stop_mode=clone:stop_duration=10[v]" \
  -map "[v]" -t 15 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -an \
  assets/libro_master.mp4
```

Tres decisiones dentro de ese comando:

**`setpts/1.85` acelera el acercamiento.** Sin eso el poema entraba en el segundo
7 de 15. Con eso entra en el 5.6.

**`tpad=stop_mode=clone` congela el último cuadro** en vez de ralentizar el clip.
Estirar con `setpts` se nota como cámara lenta; congelar no se nota porque la
cámara ya está quieta. Y es gratis.

**Se corta en el segundo 8** porque después el zoom sigue y termina desenfocado.

Guarda siempre el clip crudo en `assets/originales/`. Revertir debe ser copiar un
archivo, no volver a Flow.

---

# Parte 4 · Componer el video con ffmpeg

## Retención: el poema debe entrar pronto

En TikTok la gente decide en el primer segundo o segundo y medio. Si tu video
empieza con seis segundos de introducción bonita antes de mostrar el contenido,
el 40% del video es material que casi nadie ve.

Por eso se aceleró el acercamiento. `T_PAGINA = 5.6` es cuándo aparece la fecha;
el poema entra 0.7 s después, verso por verso cada 0.45 s.

## Coordenadas del texto

**Estas no se heredan.** Cada plantilla tiene la zona útil en otro lugar, y copiar
los valores de otro proyecto hace que el texto caiga sobre la madera, el fondo o
una zona mal iluminada.

El método para calcularlas:

1. Extrae un cuadro del momento donde el texto va a estar:
   `ffmpeg -ss <segundo> -i plantilla.mp4 -frames:v 1 cuadro.png`
2. Dibuja texto de prueba encima con `drawtext` y mira el resultado
3. Ajusta hasta que quede, probando dos o tres variantes y comparándolas
4. Solo entonces llévalo a `render.js`

Hacer esto sobre un cuadro fijo toma segundos; hacerlo renderizando el video
completo toma minutos por intento.

> **Ejemplo (poema-diario):**

```js
const T_PAGINA = 5.6;                        // la hoja llena el cuadro
const X_FECHA  = 90;                         // margen izquierdo de la fecha
const y_fecha  = Math.round(1920 * 0.315);
const yInicio  = Math.round(1920 * 0.520 - bloque / 2);  // versos centrados
```

- **Fecha y ornamento**: alineados a la orilla de la hoja izquierda, 38 px.
- **Versos**: centrados, cruzando el pliegue. Se probó ponerlos en la hoja derecha
  y se ve peor — desperdicia media pantalla y fuerza cortes de verso.
- Tinta `0x1F1710`, fecha `0x5A452A`.
- Sombra `shadowcolor=0x00000038:shadowy=2`. **No usar halo claro**: lava la letra
  sobre el papel.

## El velo de aclarado

La plantilla tiene un manuscrito impreso en las páginas. Sin tratarlo, la
escritura de fondo compite con los versos: unos se leen bien y otros no, según
dónde caigan. Inaceptable para algo que se genera solo todos los días.

La solución no fue regenerar el clip sino atenuar la escritura donde va el poema:

```js
const velo =
  `color=c=0xF0E3C8:s=1080x900:d=${DUR},format=rgba,` +
  `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
  `a='160*pow(sin(PI*Y/H)\\,0.8)*pow(sin(PI*X/W)\\,0.35)',` +
  `fade=t=in:st=${T_PAGINA}:d=0.8:alpha=1[velo]`;
// [0:v][velo]overlay=0:WASH_Y[hoja];[hoja]<drawtexts>[v]
```

La clave es el **degradado en los cuatro bordes** con las funciones seno. Un
rectángulo de opacidad plana deja un parche visible; con el degradado se funde
con el papel y conserva la textura. Aparece junto con la fecha, no desde el
inicio.

## Tipografía adaptativa

```js
const maxLen = Math.max(...poema.versos.map(v => v.length));
const fs_poema = maxLen <= 30 ? 60 : maxLen <= 38 ? 54 : maxLen <= 46 ? 47 : 42;
```

El tamaño de letra se decide por el verso más largo. Por eso el prompt del poema
limita a 42 caracteres: sin ese límite la letra se encoge y el video pierde
legibilidad en celular.

## Audio

- **Normalizar SIEMPRE a -18 LUFS** antes de instalar una pista nueva:
  `loudnorm=I=-18:TP=-1.5:LRA=11`. Sin esto, cada pista suena a un nivel distinto
  y no puedes compararlas de forma justa.
- Volumen de mezcla **0.85**. Empezó en 0.30, que servía cuando la música era
  relleno; es la única capa de audio del video y al 30% era inaudible en celular.
- Fuente: **Pixabay Music** — uso comercial sin atribución, y no dispara las
  alertas de derechos de TikTok. Guarda el link de la pista por si acaso.

Criterio para elegir pista: sin batería, sin voz, sin arranque marcado. Truco:
escúchala a la mitad de volumen; si aun así te llama la atención por sí sola, es
demasiado protagonista.

---

# Parte 5 · Generar el texto con IA

## Cascada de modelos

```js
'gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite'
```

Prueba el mejor primero y baja solo si falla. Verificado en producción: un día usó
`3.6`, otro cayó a `3.5`, ningún día falló del todo.

**Los modelos caducan.** `gemini-2.5-flash` ya devuelve 404 a cuentas nuevas. El
mensaje de error suele decir cuál usar en su lugar.

**Gemini devuelve 503 con frecuencia real** — dos veces en una hora, una de ellas
en producción. Los tres reintentos con espera creciente no son opcionales.

## Anti-repetición

Hay una lista `TEMAS` de 18 entradas. El código filtra los ya usados según
`datos/historial.json` y elige al azar entre los que quedan. Además le pasa al
modelo los últimos 8 poemas con la instrucción de no repetirse "ni en imágenes ni
en estructura".

El historial guarda las últimas 120 entradas.

## El prompt

Vive en `src/poema.js`. Cada proyecto necesita el suyo, pero **el tipo de
restricciones se repite**: cantidad de líneas, largo máximo por línea, tono,
variante del idioma, prohibición de formato que rompa el render, originalidad, y
formato de respuesta en JSON.

> **Ejemplo (poema-diario)** — las restricciones y por qué existen:

- **Exactamente 4 versos** — el diseño está calibrado para eso.
- **Máximo 42 caracteres por verso** — más largo y la letra se encoge (ver arriba).
- **Tono**: "motivacional, íntimo, esperanzador. Como una frase que alguien guarda
  en su cartera."
- **Español neutro de Latinoamérica**, nada de "vosotros".
- **Sin comillas, título, emojis, numeración ni hashtags** — romperían el render.
- **No imitar poetas existentes**, y evitar clichés nombrados explícitamente.
- **Responde solo JSON**, sin bloques de código. El código igual limpia los ```
  por si acaso, y valida que haya al menos 3 versos.

**La tipografía tiene un glifo faltante:** Cormorant Garamond no tiene ✦ y sale
como cuadro. Usar `·  ·  ·`.

---

# Parte 6 · Publicar

## TikTok por API: lo que NO se puede

El Content Posting API de TikTok **solo sube el archivo y pone el caption**. No
puede:

- agregar sonidos de la biblioteca de TikTok
- usar herramientas de edición
- poner etiquetas de ubicación
- crear carruseles

Consecuencia de diseño: **el audio va horneado dentro del mp4** y aparece como
"sonido original". Y hay un costo de alcance real: los videos publicados por API
no entran al feed de un sonido en tendencia, que es una de las pocas vías de
descubrimiento orgánico que quedan.

También hay una razón legal: los sonidos de la biblioteca están licenciados para
uso dentro de la app. Un video subido por API necesita audio con derechos propios.

## Upload-Post

Intermediario entre tu código y TikTok. `POST https://api.upload-post.com/api/upload`
con header `Authorization: Apikey <key>` y los campos `video`, `user`, `platform[]`,
`title`, `post_mode=DIRECT_POST`, `is_aigc=true`.

**TikTok NO está en el plan gratuito.** El plan Básico cuesta €13/mes facturado
anual (€152) o más en mensual. El nivel gratuito da 10 subidas al mes pero
bloquea TikTok por completo, así que **no se puede probar sin pagar**.

Recomendación: si lo contratas, empieza en **mensual**. El descuento anual del 40%
solo es ahorro si de verdad usas los doce meses, y comprometerlos antes de saber
si el contenido funciona es apostar a ciegas.

## Publicar a mano: la alternativa que vale la pena al arrancar

Para una cuenta nueva tiene ventajas reales, no es solo el plan barato:

- Puedes usar un sonido en tendencia y entrar a su feed
- Eliges el horario y lo pruebas
- Ajustas hashtags según lo que funcione
- Respondes comentarios en caliente

Y no pierdes la automatización: **separa producción de distribución.** El pipeline
sigue generando el video y el registro; tú solo bajas el artefacto y lo subes.

Si haces esto, **no corras el generador en tu máquina** mientras el cron esté
activo: tendrías dos escritores de `historial.json` y los temas divergirían. Usa
GitHub como única fuente.

## Publicar a mano, en concreto

1. Actions → abre la corrida del día → descarga el artefacto `video-del-dia`
   (caducan a los **14 días**)
2. Copia el `caption` desde Supabase
3. En TikTok Studio:
   - **Borra la descripción por defecto**, que trae el nombre del archivo
   - **Edita la portada**: elige un cuadro donde el poema esté completo, hacia el
     segundo 11-12. Por defecto toma el primer cuadro, que es negro, y en tu
     perfil se ve un hueco
   - **Sin ubicación**
   - Quién puede ver: **Todo el mundo**. En cuentas nuevas TikTok a veces lo pone
     en "Solo yo" mientras dura la revisión — hay que volver a cambiarlo después
4. Marca la fila en Supabase: `estado` → `publicado`, pega la `tiktok_url`

## Caption

Estructura que funciona, sea cual sea el tema:

```
[el contenido en texto, tal como aparece en el video]

[una pregunta que salga de ESE contenido en particular]

[3 a 5 hashtags — ver el método abajo]
```

**Repite el contenido en la descripción** aunque ya esté en el video. La
plataforma indexa ese texto para búsquedas, y quien mira sin sonido o pasa rápido
alcanza a leerlo.

**La pregunta importa más que los hashtags.** Los comentarios son la señal más
fuerte que lee el algoritmo, y una pregunta específica del contenido genera mucho
más que un "¿te gustó?" genérico. Que sea fácil de responder: si exige escribir un
párrafo, nadie responde.

> **Ejemplo (poema-diario):** para un poema sobre perdonarse a uno mismo, la
> pregunta fue "¿Con qué te falta hacer las paces?" — sale del poema y pide algo
> personal, no una opinión.

## Cómo encontrar TUS hashtags

Esta es la parte que **no se hereda de ningún manual**, porque depende del nicho,
del idioma, del país y del momento. Lo que sirve es el método.

### Paso 1 · Investiga qué usa tu nicho

Busca en la plataforma dos o tres términos que describan tu contenido. Filtra por
videos recientes y con buen desempeño — digamos, de los últimos tres meses y con
más de 50 mil reproducciones.

Abre entre diez y quince de esos videos y **anota los hashtags que se repiten**.
La repetición es la señal: si diez cuentas exitosas de tu nicho usan la misma
etiqueta, esa etiqueta tiene tráfico real.

### Paso 2 · Verifica el volumen

TikTok tiene un **Creative Center** público (`ads.tiktok.com/business/creativecenter`)
con un buscador de hashtags que muestra volumen y tendencia por país. Es gratis y
no necesitas cuenta de anunciante para consultarlo.

Lo que buscas no es el hashtag más grande. Un hashtag con millones de videos te
entierra; uno con miles y crecimiento te da oportunidad real de aparecer.

### Paso 3 · Arma tu conjunto de 4 o 5

No más. Cinco bien elegidos rinden más que quince genéricos. La composición:

| Tipo | Qué hace | Cuántos |
|---|---|---|
| **Amplio de categoría** | Volumen general | 1 |
| **De nicho, con intención de búsqueda** | Gente que busca exactamente lo tuyo | 1 o 2 |
| **Del tema de ESE video** | Cambia en cada publicación | 1 |
| **Tuyo, de marca** | Tu catálogo | 1 |

El de marca no lo usa nadie el primer día. En tres meses agrupa todo tu trabajo y
quien te descubra puede ver el resto de un clic. Vale la pena desde el video uno.

El del tema específico es el que más suele rendir, y es el único que cambia en
cada publicación. Si el video de hoy habla de un tema concreto, busca el hashtag
de ese tema en vez de repetir siempre la misma lista.

> **Ejemplo (poema-diario):** `#poesia` (amplio) · `#poemascortos` (nicho) ·
> `#amorpropio` o `#confiaenelproceso` (tema del día) · `#poesiaenespañol`
> (idioma) · `#tintaypapel` (marca).

### Lo que NO sirve

**Hashtags de alcance genérico.** `#fyp`, `#parati`, `#viral`, `#foryou` los usa
todo el mundo y no te posicionan en ningún lado. Es la creencia más extendida y
más inútil.

**Hashtags de fecha.** `#6deseptiembre` no lo busca nadie y, como cada día es
distinto, nunca acumula contenido.

**Etiquetas de otro público.** Si tu contenido es poesía y le pones
`#motivacion`, compites con cuentas de superación personal — otro público, otro
formato, y el algoritmo te muestra a gente que no te va a seguir.

### Paso 4 · Revisa cada mes

Las tendencias se mueven. Una vez al mes, repite el paso 1 y compara con lo que
estás usando. Y cruza esa revisión con tus propios datos: si llevas registro de
qué publicaste y cómo le fue, en unas semanas vas a ver qué hashtags aparecen en
tus mejores videos.

Ese es el argumento real para llenar la tabla de registro — no es burocracia, es
lo que te va a decir qué funciona.

## Identidad de la cuenta

**Decide el @ antes que el correo.** El correo casi nadie lo ve; el @ lo ve todo
el mundo y no conviene cambiarlo. Si eliges el Gmail primero y el @ está ocupado,
terminas con un correo que no corresponde a tu cuenta.

**Pon la frecuencia en el nombre visible.** Es la diferencia entre que alguien vea
un video y siga scrolleando, o que entienda que hay una razón para volver mañana.

> **Ejemplo (poema-diario):** "Tinta y papel · poema del día".

**La foto de perfil se ve como un círculo de ~50 px.** Una sola forma central con
mucho contraste. Prueba: redúcela a 50x50 y mira si todavía se distingue qué es.

---

# Parte 7 · Registro en Supabase

Es documentación, no una pieza crítica: **ninguna función lanza errores hacia
arriba**. Si Supabase está caído, avisa y sigue. Un video publicado sin registrar
es mucho mejor que un video que no se publica porque la base estaba caída.

Usa la API REST (PostgREST) directamente, sin librerías.

## Trampas que costaron trabajo

**`SUPABASE_URL` va SIN `/rest/v1/`.** La página de Data API la muestra con el
sufijo incluido, pero el código arma esa ruta. Si la guardas completa terminas
pidiendo `/rest/v1/rest/v1/poemas` y falla con un 404 difícil de diagnosticar.

**Las llaves cambiaron de nombre.** Ahora son `sb_publishable_` (antes `anon`) y
`sb_secret_` (antes `service_role`). Usa la secreta: con RLS activado, la
publicable no puede escribir nada. La secreta salta RLS y **solo puede vivir en un
servidor**.

**NO pongas `unique` en `fecha`.** Al principio lo tenía, con
`on_conflict=fecha`, y una segunda corrida el mismo día **sobreescribía el poema
de la primera sin aviso**. Se perdió trabajo. Ahora cada generación inserta una
fila nueva.

**Por eso mismo, marcar publicado/fallido se hace por `id`, no por fecha.** Con
varias filas por día, filtrar por fecha marcaría todas como publicadas. Ese tipo
de error no truena — solo miente en los datos, que es peor.

**Postgres no puede reordenar columnas.** `ADD COLUMN` siempre las pega al final.
Si el orden importa, hay que reconstruir la tabla copiando los datos. Piensa el
orden al crearla.

**En el SQL Editor**, si hay texto seleccionado solo ejecuta la selección. Y
`create or replace view` falla si cambian los nombres de columna: `drop view`
primero.

**Plan gratuito: 2 proyectos activos por organización.** Ponle a la organización
un nombre genérico, no el del primer proyecto, porque ahí van a vivir los dos.

---

# Parte 8 · Infraestructura

## GitHub Actions

```yaml
on:
  schedule:
    - cron: '0 15 * * *'    # 15:00 UTC = 9:00 en CDMX
  workflow_dispatch:
    inputs:
      solo_probar:
        type: boolean
```

`permissions: contents: write` porque el workflow hace commit de
`datos/historial.json` cada día.

**El cron llega tarde y de forma inconsistente.** Programado a las 9:00, ha
corrido a las 9:11, 12:11, 12:27 y 14:40. Los workflows programados de GitHub
corren "en la medida de lo posible" y se retrasan bajo carga, sobre todo en
cuentas gratuitas. **No hay forma de exigirle puntualidad.** Si la hora exacta
importa, hay que mover el disparador fuera de GitHub Actions.

**Los Secrets de repositorio SÍ se transfieren** al mover un repo entre cuentas
personales. Los de organización y los de entorno no.

**La cuota de Actions se cobra a la cuenta dueña del repo.** 2,000 minutos al mes
en repos privados, ilimitado en públicos.

## Trampas de entorno

**Rutas de Windows en filtros de ffmpeg.** `C:\Users\...` rompe el parser: hay que
convertir a `C\:/Users/...`. Es invisible en Linux y solo falla en Windows — la
función `escRuta` en `render.js` lo resuelve.

**`process.exit()` rompe en Windows** con "Assertion failed" de libuv. Usar
`process.exitCode`.

**`src/binarios.js` localiza ffmpeg y ffprobe** aunque no estén en el PATH, porque
en Windows es lo normal.

## Git: el flujo que funciona

El workflow hace commit todos los días, así que **siempre hay commits remotos que
no tienes**. El orden importa:

```powershell
git add <archivos>
git commit -m "..."
git pull --rebase
git push
```

**Preparar y commitear ANTES del pull.** Al revés falla: `git pull --rebase` se
niega si hay cambios sin preparar. Y si pegas todo el bloque de golpe en
PowerShell, el primer error no detiene las líneas siguientes y terminas con un
estado confuso. **Una línea a la vez.**

**Conflictos en `historial.json`** cuando hay corridas locales y del cron el mismo
día. Se resuelven conservando ambas entradas en orden cronológico, y **validando
el JSON antes de continuar**:

```bash
python3 -c "import json;d=json.load(open('datos/historial.json'));print(len(d),'OK')"
```

---

# Parte 9 · Replicar esto en otro proyecto

Lo que sigue es la receta para montar una cuenta nueva — por ejemplo frases
motivacionales — reutilizando todo lo anterior.

## Lo que se copia sin cambios

- La arquitectura completa: plantilla fija + texto dinámico
- `src/config.js`, `src/binarios.js`, `src/supabase.js` — genéricos
- El esquema de Supabase (cambia el nombre de la tabla)
- El workflow de GitHub Actions (cambia el cron si quieres otra hora)
- El flujo de git y todas las trampas de entorno

## Lo que hay que decidir de nuevo

**1. Identidad.** Nombre, @, correo, foto de perfil. Decide el @ primero.

**2. La plantilla visual.** Este es el trabajo real. Presupuesta varios intentos
de IA de video y aplica lo de la Parte 3. Si el presupuesto es corto, considera
generar **dos clips cortos y unirlos con ffmpeg** en vez de pedir una sola toma
de 8 segundos con muchas condiciones — pedirlo todo junto es lo que más falla.

**3. Las coordenadas del texto.** No se heredan. Cada plantilla tiene la zona útil
en otro lugar. El método:

- Extrae un cuadro del momento donde el texto va a estar
- Dibújale texto de prueba con `drawtext` y míralo
- Ajusta `y_fecha`, `yInicio` y el velo hasta que quede
- Solo entonces tócalo en `render.js`

**4. El prompt del texto.** Cambia tema, tono y estructura. Mantén el límite de
caracteres alineado con tu tipografía adaptativa.

**5. La lista de temas.** 18 entradas dan bastante margen antes de reciclar.

**6. La música.** Otra pista, normalizada a -18 LUFS igual.

## Orden recomendado

1. Decide identidad y verifica que el @ esté libre
2. Copia el repo, renombra, limpia `datos/historial.json`
3. Genera la plantilla — la parte lenta y cara
4. Ajusta coordenadas con renders de prueba locales
5. Instala la música
6. Crea el proyecto de Supabase y carga los Secrets
7. Lanza el workflow en modo prueba y audita el resultado
8. Publica a mano un mes antes de decidir si automatizas la distribución

## Errores que NO vas a querer repetir

- Regenerar con IA lo que se arregla cortando en post
- Agregar reglas al prompt de video en vez de simplificarlo
- Poner `unique` en la fecha de la tabla
- Guardar `SUPABASE_URL` con `/rest/v1/`
- Instalar una pista de música sin normalizar
- Ejecutar `git pull --rebase` antes de commitear
- Dejar la portada por defecto en TikTok
- Pagar un año por adelantado de una herramienta que no has probado

---

# Apéndice · Comandos frecuentes

```powershell
# Generar el video del día en tu máquina (sin publicar)
npm run prueba

# Reconstruir la plantilla desde un clip nuevo — ver Parte 3
# (NO uses integrar-clip.sh tal cual)

# Auditar un video cuadro por cuadro
ffmpeg -y -i video.mp4 -vf "fps=3,scale=200:-1,tile=6x4" -frames:v 1 tira.png

# Normalizar una pista de música
ffmpeg -y -i pista.mp3 -af "loudnorm=I=-18:TP=-1.5:LRA=11" `
  -c:a libmp3lame -b:a 192k -ar 44100 -ac 2 assets/audio/fondo.mp3

# Validar el historial después de un conflicto
python3 -c "import json;d=json.load(open('datos/historial.json'));print(len(d),'OK')"

# Conectar TikTok a Upload-Post (una sola vez)
node -e "import('./src/publicar.js').then(m=>m.linkDeConexion())"
```

## Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `GEMINI_API_KEY` | Sí* | Generar el poema (nivel gratuito) |
| `ANTHROPIC_API_KEY` | No | Alternativa a Gemini, tiene prioridad. ~$0.19/mes |
| `SUPABASE_URL` | No | Registro. **Sin `/rest/v1/`** |
| `SUPABASE_SERVICE_KEY` | No | La llave `sb_secret_` |
| `UPLOADPOST_API_KEY` | No | Publicación automática |
| `UPLOADPOST_USER` | No | Nombre del perfil en Upload-Post |
| `ZONA_HORARIA` | No | Por defecto `America/Mexico_City` |
| `PUBLICAR` | No | `false` genera sin publicar |

\* Una de las dos, Gemini o Claude.

## Costo mensual

| Componente | Costo |
|---|---|
| Poema (Gemini nivel gratuito) | $0 |
| Edición (ffmpeg) | $0 |
| Servidor (GitHub Actions) | $0 |
| Registro (Supabase) | $0 |
| Publicación (Upload-Post Básico) | €13/mes |

Sin la publicación automática, la operación completa cuesta **$0**. La plantilla
de video es un gasto único de créditos de IA.
