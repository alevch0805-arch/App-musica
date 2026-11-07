# Instrucciones para Claude

- **Idioma: todo en español.** Las respuestas, los mensajes intermedios mientras se trabaja
  («cargando», «voy a…», avisos), las descripciones de los comandos, los textos de la app,
  los comentarios del código y los mensajes de los commits.
- El usuario no es programador: explicar los pasos de forma sencilla, sin jerga.
- Los himnarios con derechos de autor van en `contenido/` (excluido de git); nunca se suben al repositorio.
- Pruebas antes de guardar cambios: `npm test`, `npx tsc --noEmit` y, si se toca la base de datos,
  `supabase/tests/run.sh`. Pruebas del conversor: `python3 -m unittest discover -s scripts -p 'test_*.py'`.
