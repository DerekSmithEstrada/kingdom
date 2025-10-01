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

- **Flask mínimo**: una sola ruta (`/`) que renderiza la plantilla principal.
- **Maquetación Tailwind**: se carga desde CDN, sin build tools adicionales.
- **Interacción básica**: acordeones, asignación de trabajadores, y ajustes de comercio con estado persistido en `localStorage`.
- **Assets estáticos**: estilos adicionales, JavaScript y `png` de marcador de posición para los íconos.

## Limitaciones

- No hay backend ni simulación económica real; todos los datos son mock en el navegador.
- Las acciones de construcción/comercio sólo actualizan el estado de la UI.

Este proyecto sirve como punto de partida para iterar sobre el diseño de un panel de aldea *idle*.
