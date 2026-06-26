# Fichaje Seguro

<p align="center">
  <img src="assets/fichaje_seguro_banner.png" alt="Fichaje Seguro Banner" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google-apps-script&logoColor=white" alt="Google Apps Script Badge">
  <img src="https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=google-sheets&logoColor=white" alt="Google Sheets Badge">
  <img src="https://img.shields.io/badge/Tailwind%20CSS-38BDF8?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS Badge">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="License Badge">
</p>

Un sistema moderno de control de asistencia y registro de presencia desarrollado en **Google Apps Script** y **Google Sheets**, diseñado para ejecutarse a coste cero en Google Workspace. El desarrollo incluye captura frontal de selfie, geolocalización por coordenadas GPS directas a Google Maps, y auditorías automáticas de fraude por huella digital del dispositivo y colisión temporal.

> [!IMPORTANT]
> **Carácter experimental y académico**: Este desarrollo no pretende constituir una herramienta lista para entornos de producción corporativos de alta criticidad. Su propósito es servir como un pequeño experimento práctico y académico para demostrar cómo implementar un sistema de fichaje razonablemente seguro, auditado y robusto en Google Workspace a coste cero, aprovechando la infraestructura existente de Google Sheets, Drive y Apps Script.

<p align="center">
  <a href="#características">Características</a> •
  <a href="#controles-técnicos-y-mitigación-de-fraude">Mitigación de fraude</a> •
  <a href="#menú-de-la-aplicación">Menú de la aplicación</a> •
  <a href="#instalación-y-configuración">Instalación</a> •
  <a href="#estructura-del-proyecto">Estructura</a> •
  <a href="#licencia">Licencia</a>
</p>

---

## Características

- 📱 **Interfaz web fluida y moderna**: Diseñada con Tailwind CSS y responsive (optimizada para móviles y tablets), con soporte para temas visuales dinámicos configurables desde la hoja de cálculo.
- ⚙️ **Inicialización en un clic**: Estructuración automática de las pestañas de la hoja de cálculo (`Asistencia` y `Ajustes`) aplicando estilos oscuros, formateo rápido, inmovilización de filas y ajuste de anchos de columna.
- 📊 **Panel de control interactivo**: Dashboard integrado en la hoja de cálculo mediante un diálogo HTML de gran formato con indicadores clave (Scorecards), gráficos interactivos a través de **Chart.js** (volumen de fichajes y distribución de seguridad) y filtros de búsqueda avanzados.
- 🔍 **Buscadores avanzados**: Filtros rápidos por ID de usuario y por dispositivo (Hash/Navegador), además de filtros por estados (con alertas de fraude o sin coordenadas GPS).
- 📅 **Control de rango temporal flexible**: Filtrado rápido de registros en tiempo real: Hoy, esta semana, este mes, este trimestre, o rango personalizado entre fechas.
- ⚙️ **Parámetros configurables**: Panel visual integrado para ajustar dinámicamente las medidas de seguridad del backend (cooldown, umbrales de tiempo, obligatoriedad de GPS/Selfie) sin necesidad de tocar una línea de código.

---

## Controles técnicos y mitigación de fraude

Para garantizar la veracidad de cada registro, el sistema implementa múltiples capas de verificación técnica correlacionadas en tiempo real en el servidor:

1. **Geolocalización obligatoria verificada**:
   - Solicita permisos de GPS nativos en el navegador del dispositivo del usuario.
   - Si está activa la obligatoriedad, impide el envío si no se obtienen coordenadas reales.
   - Traduce latitud y longitud a un enlace hipervínculo dinámico a Google Maps en la hoja de cálculo (`📍 Ver mapa`) utilizando la sintaxis `=HYPERLINK("https://www.google.com/maps?q=lat,lng"; "📍 Ver mapa")`.

2. **Selfie de verificación (Biometría visual)**:
   - Captura la imagen usando la cámara frontal nativa del dispositivo.
   - Transmite los datos decodificados en Base64 al backend, donde se crea un archivo JPEG almacenado de forma segura en Google Drive (en la carpeta que elija el administrador o en la raíz del propio proyecto).
   - Genera un enlace directo a la visualización de la fotografía en la hoja de cálculo.

3. **Huella digital del dispositivo (Device Fingerprinting)**:
   - Calcula localmente un hash único hexadecimal a partir de especificaciones de hardware y entorno del navegador: resolución de pantalla, idioma del sistema, zona horaria (`timezoneOffset`), núcleos de CPU (`hardwareConcurrency`), profundidad de color y agente de usuario (`userAgent`).
   - Esto permite identificar el dispositivo físico del usuario de manera persistente sin necesidad de almacenar cookies intrusivas o datos personales de rastreo.

4. **Detección de colisiones de huella**:
   - Si la medida está activada, el backend escanea el historial reciente del servidor dentro de una ventana de tiempo predefinida (por ejemplo, 15 minutos).
   - Si se detecta un fichaje con una huella digital idéntica pero con un ID de usuario diferente en un intervalo de tiempo muy corto (por ejemplo, menor a 120 segundos), el sistema levanta automáticamente una etiqueta de **"Alerta de fraude"** indicando el conflicto para auditoría inmediata.

5. **Periodo de contención (Cooldown) en servidor**:
   - Evita la duplicación o el spam de registros aplicando un bloqueo temporal controlado.
   - El sistema rechaza inmediatamente el fichaje si el mismo ID de usuario o el mismo hash de dispositivo intenta registrar asistencia antes de que transcurran los minutos de cooldown mínimos establecidos por el administrador.

---

## Menú de la aplicación

El script extiende la interfaz de Google Sheets agregando un menú personalizado llamado `🔒 Fichaje Seguro` estructurado en secciones independientes:

- **Sección 1: Inicialización**
  - `⚙️ Inicializar sistema`: Analiza metadatos del proyecto y crea las hojas iniciales. Si el sistema ya estaba configurado, lanza un diálogo de advertencia para evitar sobrescrituras accidentales.
- **Sección 2: Operaciones y Configuración**
  - `🔧 Configurar parámetros`: Abre la ventana de configuración para administrar niveles de seguridad e interfaces.
  - `🚀 Guía de despliegue`: Guía paso a paso sobre cómo publicar el formulario como aplicación web pública en Google Apps Script.
- **Sección 3: Panel Analítico**
  - `📊 Panel de control`: Dashboard analítico interactivo de gran tamaño con gráficos de rendimiento y tablas de auditoría.
- **Sección 4: Herramientas de Desarrollo**
  - `🧪 Generar datos de prueba`: Genera de manera limpia 50 registros cronológicamente espaciados a lo largo de 15 días (incluyendo escenarios normales y simulaciones de fraude por colisión de huellas) para validar el comportamiento del panel.
- **Sección 5: Información**
  - `ℹ️ Acerca de...`: Información general del proyecto y autoría.

---

## Instalación y configuración

### Paso 1: Importación del código
1. Crea una nueva hoja de cálculo en **Google Sheets**.
2. Ve a **Extensiones > Apps Script**.
3. Reemplaza el contenido de `Código.gs` con el código del backend de este repositorio.
4. Crea los archivos HTML correspondientes en tu proyecto de Apps Script y pega sus contenidos:
   - `Index.html` (Formulario de registro)
   - `DashboardUI.html` (Panel de mando)
   - `AjustesUI.html` (Configuración)
   - `ConfirmarInicializacionUI.html` (Confirmación de reinicio)
   - `ConfirmMockDataUI.html` (Confirmación de sobrescritura de pruebas)
   - `NotificacionUI.html` (Diálogos de alerta estilizados)
   - `AcercaDe.html` (Información del proyecto)
   - `DespliegueUI.html` (Guía de publicación)

### Paso 2: Inicialización del sistema
1. Recarga tu hoja de cálculo.
2. Haz clic en el menú contextual **🔒 Fichaje Seguro > ⚙️ Inicializar sistema**.
3. Otorga los permisos requeridos por el script (lectura/escritura en Sheets y Google Drive).
4. El script creará automáticamente las hojas necesarias y ocultará la hoja de parámetros (`Ajustes`) para mayor protección.

### Paso 3: Publicación de la aplicación web
1. En el editor de Apps Script, haz clic en **Implementar > Nueva implementación**.
2. Selecciona el tipo de implementación **Aplicación web**.
3. Configura:
   - **Ejecutar como**: `Tú (tu dirección de correo)` (para permitir el guardado de fotos en tu Drive y firmas en tu Sheet).
   - **Quién tiene acceso**: `Cualquiera` o `Cualquiera con cuenta de Google` (según tus necesidades).
4. Haz clic en **Implementar** y copia la URL proporcionada. Esa es la URL que compartirás con tus usuarios para registrar asistencia.

---

## Estructura del proyecto

```bash
├── Código.gs                   # Backend de Apps Script (lógica de servidor, base de datos y auditoría)
├── Index.html                  # Interfaz del usuario (cámara, geolocalización y fingerprinting)
├── DashboardUI.html            # Panel de mando analítico con Chart.js
├── AjustesUI.html              # Modal de configuración de parámetros de seguridad
├── NotificacionUI.html         # Plantilla HTML reutilizable para notificaciones estilizadas
├── ConfirmarInicializacionUI.html # Ventana de advertencia al reinicializar hojas
├── ConfirmMockDataUI.html      # Ventana de advertencia al generar registros de prueba
├── AcercaDe.html               # Diálogo Acerca de...
├── DespliegueUI.html           # Guía visual de despliegue paso a paso
├── assets/                     # Directorio de recursos gráficos
│   └── fichaje_seguro_banner.png # Banner del proyecto
└── appsscript.json             # Manifiesto de configuración de Apps Script
```

---

## Licencia

Este proyecto está bajo la Licencia MIT. Para más detalles, consulta el archivo [LICENSE](LICENSE).
