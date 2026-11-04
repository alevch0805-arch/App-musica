# Himnos y acordes

App para tocar himnos: varios himnarios, acordes sobre la letra, cambio de tono,
cejilla, diagramas por instrumento y práctica con vídeos de YouTube en los que
se va resaltando el acorde que suena (al estilo Chordify). El acceso es por
invitación y cada cuenta sólo puede usarse en **2 dispositivos**.

## Qué hace ya

| Función | Detalle |
|---|---|
| Himnarios | Varios himnarios; búsqueda por número, título o letra (sin importar tildes); favoritos. |
| Acordes | Formato ChordPro (`[G]Santo`). Acepta notación americana (C, Am) y latina (Do, Lam). |
| Cambio de tono | ±semitono con un toque; muestra el tono original y en el que suena. Sostenidos/bemoles automáticos según el tono. |
| Cejilla | Ajuste manual y **cejilla sugerida** (la que deja los acordes más fáciles). |
| Instrumentos | Diagramas de guitarra, ukelele y piano, calculados para cualquier acorde (también los transportados). |
| Notación | Americana (C D E) o latina (Do Re Mi), a elección de cada usuario. |
| Vídeo | Reproductor oficial de YouTube. **Sincronización a toques**: mientras suena, pulsas «Marcar» (o la barra espaciadora) en cada cambio de acorde. Luego, al reproducir, resalta el acorde actual, muestra su diagrama y los siguientes, y hace scroll solo. Tocar un acorde salta a ese punto del vídeo. Velocidad 0.5×–1.25× y ajuste fino del desfase. |
| Publicar sincronización | El administrador sincroniza un vídeo una vez y lo publica para todos. |
| Listas para el culto | Himnos en orden, cada uno en su tono para ese día, con notas («sólo estrofas 1 y 3»). Se toca pasando de un himno a otro con flechas o pedal; se envía por WhatsApp. Se guardan en la nube y funcionan sin conexión. Una lista **compartida** la ven todos los usuarios (sólo lectura, pueden copiarla); el administrador puede editar las compartidas. |
| Modo proyector | Sólo la letra, en grande, una estrofa por pantalla. Avanza con flechas, espacio, mando de presentación o tocando la pantalla; tecla B = pantalla en negro; pasa solo al siguiente himno de la lista. |
| Metrónomo | Usa el tempo y el compás del himno (3/4, 6/8…), acento en el primer tiempo, ajuste ±1 y «Tap» para marcar el tempo tocando. Recuerda el tempo elegido para cada himno. |
| Cantos propios | Editor con vista previa; convierte el formato «acordes encima de la letra» a ChordPro. |
| Cuentas | Registro sólo con código de invitación, máximo 2 dispositivos por cuenta, desvincular uno cada 30 días. |
| Panel de administrador | Crear invitaciones (para 1 o varias personas, con caducidad) y enviarlas por WhatsApp con el enlace y el código. Ver usuarios, sus dispositivos y último uso; quitar dispositivos, subir el límite a alguien, bloquear o dar permisos de admin. |
| Sin conexión | App instalable (PWA); guarda la última copia de los himnarios para usarla sin internet. |

## Probarla

```bash
npm install
npm run dev        # abre http://localhost:5173 (modo demo, sin cuentas)
npm test           # pruebas de la lógica musical
npm run build      # versión para publicar, en dist/
```

Sin configurar Supabase la app arranca en **modo demo** con dos himnos de
dominio público (`himnarios/demo/`).

## Activar cuentas y el límite de 2 dispositivos

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. En *SQL Editor* ejecuta, en orden, `supabase/migrations/001_inicial.sql`,
   `supabase/migrations/002_admin.sql` y `supabase/migrations/003_listas.sql`.
3. Copia `.env.example` a `.env` y pon la *Project URL* y la *anon key*.
4. Crea **tu** primera invitación por SQL (las demás, desde el panel *Admin* de la app):
   ```sql
   insert into invite_codes (code, note) values ('HIM-PRIMERA-01', 'Administrador');
   ```
5. Regístrate en la app con ese código y hazte administrador:
   ```sql
   update profiles set is_admin = true where email = 'tu@correo.com';
   ```
6. Sube cada himnario (carpeta con `himnario.json` + un `.cho` por himno):
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run importar -- contenido/mi-himnario
   ```
   La carpeta `contenido/` está en `.gitignore` para que los himnarios con
   derechos de autor no acaben en el repositorio.

Cómo se hace cumplir el límite: cada dispositivo genera un identificador y lo
envía en cada petición (`x-device-id`). La base de datos sólo registra 2 por
cuenta (`register_device`) y **sólo entrega los himnos a dispositivos
registrados** (políticas RLS), así que no basta con modificar la app para
saltárselo. Para cambiar el límite de alguien:
`update profiles set max_devices = 3 where email = '...'`.

Las reglas de la base de datos tienen pruebas propias (invitaciones, límite de
dispositivos, permisos, bloqueo). Con un Postgres local:
`PGHOST=... PGUSER=postgres supabase/tests/run.sh`.

## Distribuirla a tus usuarios

- **Android**: empaqueta con [Capacitor](https://capacitorjs.com)
  (`npx cap add android`) y comparte el APK directamente; para uso privado no
  necesitas Google Play.
- **iPhone**: lo más sencillo es la PWA (Safari → Compartir → *Añadir a pantalla
  de inicio*). Una app nativa exige cuenta de Apple Developer (99 USD/año) y
  TestFlight o App Store.
- **Web**: sube `dist/` a Netlify, Vercel o Cloudflare Pages (gratis).

## Estructura

```
himnarios/demo/         himnos de ejemplo (ChordPro)
src/music/              teoría musical, ChordPro, digitaciones (con pruebas)
src/components/         diagramas, letra con acordes, reproductor sincronizado
src/pages/              biblioteca, himno, editor, acceso, dispositivos, ajustes
src/data/repo.ts        carga de himnarios (servidor / caché / demo)
supabase/migrations/    base de datos, invitaciones y límite de dispositivos
scripts/                importador de himnarios
```
