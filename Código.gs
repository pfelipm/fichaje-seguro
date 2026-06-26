/**
 * SISTEMA DE ASISTENCIA Y CONTROL DE ACCESO GEOLOCALIZADO (V2)
 * Backend de Google Apps Script (Código.gs)
 * * Este script administra la lógica del servidor, procesando la carga de
 * imágenes de selfie a Google Drive, el registro en Google Sheets con enlaces
 * directos a Google Maps, y la detección inteligente de fraude por huella digital.
 */

// Nombre de las pestañas en Google Sheets
const TAB_ASISTENCIA = "Asistencia";
const TAB_AJUSTES = "Ajustes";

/**
 * Sirve la interfaz web HTML al usuario
 * Inyecta dinámicamente la configuración actual desde el Sheet usando plantillas.
 */
function doGet() {
  // Aseguramos que la hoja esté lista antes de que cargue el frontend
  inicializarSistema();
  
  const template = HtmlService.createTemplateFromFile('Index');
  
  // Obtenemos ajustes y los convertimos a JSON para el Frontend
  const ajustes = obtenerAjustes();
  template.ajustes = JSON.stringify(ajustes);
  
  return template.evaluate()
      .setTitle('Registro de Asistencia Universitario')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inicializa automáticamente la hoja de cálculo con las pestañas y valores por defecto
 * si no existieran previamente. Diseñado para una instalación limpia con 1 clic.
 */
function inicializarSistema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Inicializar pestaña de Asistencia (Incluye nueva columna de Google Maps)
  let sheetAsistencia = ss.getSheetByName(TAB_ASISTENCIA);
  if (!sheetAsistencia) {
    sheetAsistencia = ss.insertSheet(TAB_ASISTENCIA);
    const cabeceras = [
      "Fecha y Hora", 
      "Nombre Estudiante", 
      "Latitud", 
      "Longitud", 
      "Mapa (Google Maps)", // Nueva columna de mapeo directo
      "Enlace Selfie (Drive)", 
      "ID Huella Digital", 
      "Resolución de Pantalla", 
      "Navegador / Dispositivo", 
      "Alerta de Fraude (Huella Rápida)"
    ];
    sheetAsistencia.appendRow(cabeceras);
    sheetAsistencia.getRange(1, 1, 1, cabeceras.length)
      .setBackground("#1E293B")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    sheetAsistencia.setFrozenRows(1);
  }
  
  // 2. Inicializar pestaña de Ajustes (Incluye nuevo parámetro MEDIDA_GPS)
  let sheetAjustes = ss.getSheetByName(TAB_AJUSTES);
  if (!sheetAjustes) {
    sheetAjustes = ss.insertSheet(TAB_AJUSTES);
    const cabecerasAjustes = ["Parámetro de Seguridad", "Valor", "Descripción / Instrucciones"];
    sheetAjustes.appendRow(cabecerasAjustes);
    
    // Valores por defecto actualizados
    const valoresDefecto = [
      ["MEDIDA_GPS", "TRUE", "Exige geolocalización obligatoria para poder registrar asistencia (TRUE / FALSE)"],
      ["MEDIDA_SELFIE", "TRUE", "Activa el selfie obligatorio de verificación visual (TRUE / FALSE)"],
      ["CARPETA_DRIVE_ID", "", "ID de la carpeta de Drive donde se guardarán las fotos (Vacío = misma carpeta del Sheet)"],
      ["MEDIDA_BLOQUEO", "TRUE", "Activa el bloqueo local del dispositivo por tiempo (TRUE / FALSE)"],
      ["TIEMPO_CONTENCION_MIN", "15", "Minutos mínimos de espera en el dispositivo antes de permitir otro registro"],
      ["MEDIDA_HUELLA", "TRUE", "Activa el sistema de alertas por colisión rápida de huellas digitales (TRUE / FALSE)"],
      ["UMBRAL_HUELLA_SEG", "120", "Segundos máximos de tolerancia entre huellas idénticas antes de lanzar alarma"]
    ];
    
    sheetAjustes.getRange(2, 1, valoresDefecto.length, 3).setValues(valoresDefecto);
    sheetAjustes.getRange(1, 1, 1, 3)
      .setBackground("#0F766E")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    
    sheetAjustes.setFrozenRows(1);
    sheetAjustes.autoResizeColumns();
  }
}

/**
 * Lee los ajustes de seguridad configurados en la pestaña "Ajustes"
 * @returns {Object} Mapa clave-valor con los ajustes tipados.
 */
function obtenerAjustes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TAB_AJUSTES);
  if (!sheet) return {};
  
  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const ajustes = {};
  
  datos.forEach(fila => {
    const clave = fila[0].toString().trim();
    let valor = fila[1].toString().trim();
    
    // Casteo de tipos básicos (booleans y enteros)
    if (valor.toUpperCase() === "TRUE") {
      ajustes[clave] = true;
    } else if (valor.toUpperCase() === "FALSE") {
      ajustes[clave] = false;
    } else if (!isNaN(valor) && valor !== "") {
      ajustes[clave] = Number(valor);
    } else {
      ajustes[clave] = valor;
    }
  });
  
  return ajustes;
}

/**
 * Procesa la recepción del formulario del estudiante
 * @param {Object} datos Estructura con la información recopilada en el cliente
 * @returns {String} Mensaje de éxito o error para el cliente
 */
function registrarEstudiante(datos) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TAB_ASISTENCIA);
    const ajustes = obtenerAjustes();
    
    const fechaActual = new Date();
    let urlFoto = "No requerida";
    let alertaHuella = "NO";
    let enlaceMapa = "No proporcionado";
    
    // --- VERIFICACIÓN DE SEGURIDAD: GPS ---
    if (ajustes.MEDIDA_GPS) {
      if (!datos.latitud || !datos.longitud) {
        throw new Error("El profesor requiere geolocalización obligatoria para registrar tu asistencia.");
      }
    }
    
    // Crear enlace hipervínculo de Google Maps si existen coordenadas
    if (datos.latitud && datos.longitud) {
      enlaceMapa = `=HYPERLINK("https://www.google.com/maps?q=${datos.latitud},${datos.longitud}", "📍 Ver Mapa")`;
    }
    
    // --- ACCIÓN 1: PROCESAR SELFIE (Guardado seguro en Drive) ---
    if (ajustes.MEDIDA_SELFIE) {
      if (!datos.fotoBase64) {
        throw new Error("El sistema requiere que te tomes una foto de verificación.");
      }
      
      // Determinar la carpeta destino
      let carpetaDestino;
      if (ajustes.CARPETA_DRIVE_ID && ajustes.CARPETA_DRIVE_ID.trim() !== "") {
        carpetaDestino = DriveApp.getFolderById(ajustes.CARPETA_DRIVE_ID.trim());
      } else {
        // Por defecto, guardar en la carpeta donde reside esta hoja
        const archivoSheet = DriveApp.getFileById(ss.getId());
        const carpetasPadre = archivoSheet.getParents();
        if (carpetasPadre.hasNext()) {
          carpetaDestino = carpetasPadre.next();
        } else {
          carpetaDestino = DriveApp.getRootFolder();
        }
      }
      
      // Decodificar Base64 y guardar como JPEG
      const partesBase64 = datos.fotoBase64.split(',');
      const tipoMime = "image/jpeg";
      const blob = Utilities.newBlob(
        Utilities.base64Decode(partesBase64[1]), 
        tipoMime, 
        `selfie_${datos.nombre.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${fechaActual.getTime()}.jpg`
      );
      
      const archivoFoto = carpetaDestino.createFile(blob);
      archivoFoto.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      urlFoto = archivoFoto.getUrl();
    }
    
    // --- ACCIÓN 3: AUDITORÍA DE HUELLA DIGITAL (Detección de fraude ajustada para 10 columnas) ---
    if (ajustes.MEDIDA_HUELLA && datos.fingerprint) {
      const ultimaFila = sheet.getLastRow();
      if (ultimaFila > 1) {
        // Buscamos colisiones en las últimas 100 asistencias
        const filasABuscar = Math.max(2, ultimaFila - 100);
        const rangoDeBusqueda = sheet.getRange(filasABuscar, 1, (ultimaFila - filasABuscar) + 1, 10).getValues();
        
        const tiempoActualMs = fechaActual.getTime();
        const umbralMs = ajustes.UMBRAL_HUELLA_SEG * 1000;
        
        for (let i = 0; i < rangoDeBusqueda.length; i++) {
          const registroFecha = new Date(rangoDeBusqueda[i][0]);
          // La huella digital ahora se desplazó al índice de columna 6 (ID Huella Digital)
          const registroHuella = rangoDeBusqueda[i][6];
          const registroEstudiante = rangoDeBusqueda[i][1];
          
          if (registroHuella === datos.fingerprint) {
            const diferenciaTiempoMs = Math.abs(tiempoActualMs - registroFecha.getTime());
            
            // Si el mismo dispositivo intentó registrar a otra persona en menos tiempo que el umbral
            if (diferenciaTiempoMs < umbralMs) {
              alertaHuella = `¡ALERTA! Mismo dispositivo detectado con '${registroEstudiante}' hace ${Math.round(diferenciaTiempoMs/1000)} seg.`;
              break;
            }
          }
        }
      }
    }
    
    // Registrar la fila de datos consolidada
    sheet.appendRow([
      fechaActual,
      datos.nombre,
      datos.latitud || "No disponible",
      datos.longitud || "No disponible",
      enlaceMapa,
      urlFoto,
      datos.fingerprint,
      datos.resolucion,
      datos.userAgent,
      alertaHuella
    ]);
    
    return "¡Registro verificado y guardado con éxito!";
    
  } catch (error) {
    return "Error en el servidor: " + error.message;
  }
}