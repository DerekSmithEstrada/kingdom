# Idle Village UI Prototype

Idle Village es un prototipo ligero de interfaz inspirado en juegos *idle*. Está construido con Flask sirviendo HTML estático, TailwindCSS por CDN y un poco de JavaScript sin dependencias para simular la interacción básica del panel.

## Requisitos

- Python 3.10 o superior

## Instalación y ejecución

### Windows (PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:FLASK_APP = "app"
flask run
```

### macOS / Linux (Bash)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export FLASK_APP=app
flask run
```

Abrí <http://127.0.0.1:5000> en tu navegador para ver el panel.

## Qué incluye

- **Simulación de backend en memoria**: `core.game_state` calcula producción, trabajadores y comercio con un reloj interno para entregar snapshots consistentes.
- **Puente `api/ui_bridge`**: expone operaciones de tick, construcción, comercio y asignación de trabajadores listas para reutilizarse desde la UI o rutas HTTP.
- **Persistencia simple**: `core.persistence` ofrece guardado y carga en disco, integrados en el puente para facilitar su consumo desde la interfaz.
- **Frontend ligero**: Flask sirve la plantilla principal con Tailwind por CDN y JavaScript sin dependencias que invoca las acciones anteriores.

## Limitaciones

- La simulación corre en un solo proceso y no guarda automáticamente; hay que llamar a los helpers de guardado/carga cuando corresponda.
- Todavía no existen rutas HTTP dedicadas: toda la interacción pasa por el puente en memoria y cualquier API adicional debe implementarse manualmente.

Este proyecto sirve como punto de partida para iterar sobre el diseño de un panel de aldea *idle*.

## Pruebas y API

### Pruebas del backend

Con el entorno virtual activo y las dependencias instaladas, ejecuta:

```bash
python -m pytest
```

Para aislar el conjunto básico también puedes correr directamente el módulo de pruebas principal:

```bash
python tests/test_backend.py
```

### Verificación automática

- Ejecuta `pytest -q` para correr la verificación E2E de la API que valida el arranque limpio y la primera producción de madera.
- Abre `http://127.0.0.1:5000/?verify=1` con la caché del navegador limpia para activar el modo de verificación visual: se mostrará un overlay con los checks y los detalles quedarán registrados en `window.__verifyLog`.

### Integración con futuras rutas HTTP

- Importa las funciones necesarias desde `api.ui_bridge` dentro de las nuevas rutas Flask para reutilizar la simulación existente.
- Cada función devuelve diccionarios listos para serializar como JSON, lo que simplifica la exposición como endpoints REST.
- Llama periódicamente a `tick(dt)` (por ejemplo, desde una tarea programada o un endpoint dedicado) para mantener el estado sincronizado antes de responder a los clientes.

## Módulos clave para contribuir

- `core/game_state.py`: núcleo de la simulación y punto central para snapshots hacia la UI.
- `core/trade.py`: lógica de canales de comercio y reglas de intercambio de recursos.
- `core/persistence.py`: utilidades de serialización/deserialización para guardar y cargar partidas.
