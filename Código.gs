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
 * Inyecta dinámicamente la configuración actual desde el Sheet usando plantilla.
 */
function doGet(e) {
  // Aseguramos que la hoja esté lista antes de que cargue el frontend de forma silenciosa
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(TAB_ASISTENCIA) || !ss.getSheetByName(TAB_AJUSTES)) {
    ejecutarInicializacionLimpia();
  }
  
  const template = HtmlService.createTemplateFromFile('Index');
  
  // Obtenemos ajustes y los convertimos a JSON para el Frontend
  const ajustes = obtenerAjustes();
  template.ajustes = JSON.stringify(ajustes);
  
  // Registramos automáticamente la URL de producción si se visita en producción
  registrarYObtenerUrl();
  
  return template.evaluate()
      .setTitle('Registro de Asistencia Universitario')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Comprueba si el sistema ya ha sido inicializado y abre el modal de confirmación o ejecuta la instalación limpia.
 */
function inicializarSistemaDesdeMenu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let yaInicializado = false;
  
  // Comprobamos usando Developer Metadata
  const metadatos = ss.getDeveloperMetadata();
  for (let i = 0; i < metadatos.length; i++) {
    if (metadatos[i].getKey() === "fichaje_seguro_inicializado") {
      yaInicializado = true;
      break;
    }
  }
  
  // Fallback por si borraron los metadatos pero las hojas siguen ahí
  if (!yaInicializado && (ss.getSheetByName(TAB_ASISTENCIA) || ss.getSheetByName(TAB_AJUSTES))) {
    yaInicializado = true;
  }
  
  if (yaInicializado) {
    const html = HtmlService.createHtmlOutputFromFile('ConfirmarInicializacionUI')
        .setWidth(500)
        .setHeight(470)
        .setTitle('Confirmar inicialización');
    SpreadsheetApp.getUi().showModalDialog(html, 'Confirmar inicialización');
  } else {
    ejecutarInicializacionLimpia();
    mostrarNotificacion("Sistema inicializado", "El sistema Fichaje Seguro ha sido inicializado con éxito por primera vez.", "exito");
  }
}

/**
 * Elimina las hojas existentes y sus configuraciones para forzar una inicialización desde cero.
 */
function ejecutarInicializacionForzada() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Eliminar hojas si existen
  const sheetAsistencia = ss.getSheetByName(TAB_ASISTENCIA);
  if (sheetAsistencia) {
    ss.deleteSheet(sheetAsistencia);
  }
  const sheetAjustes = ss.getSheetByName(TAB_AJUSTES);
  if (sheetAjustes) {
    ss.deleteSheet(sheetAjustes);
  }
  
  // Limpiar metadatos antiguos de la hoja de cálculo
  const metadatos = ss.getDeveloperMetadata();
  metadatos.forEach(m => {
    if (m.getKey() === "fichaje_seguro_inicializado") {
      m.remove();
    }
  });
  
  // Ejecutar inicialización limpia y retornar éxito
  ejecutarInicializacionLimpia();
  return "¡Sistema reinicializado y restaurado con éxito!";
}

/**
 * Ejecuta la creación limpia de las hojas y la inserción de datos iniciales.
 */
function ejecutarInicializacionLimpia() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Inicializar pestaña de Asistencia (Incluye nueva columna de Google Maps)
  let sheetAsistencia = ss.getSheetByName(TAB_ASISTENCIA);
  if (!sheetAsistencia) {
    sheetAsistencia = ss.insertSheet(TAB_ASISTENCIA);
    const cabeceras = [
      "Fecha y Hora", 
      "ID usuario", 
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
  }
  
  // Congelar encabezado de Asistencia
  sheetAsistencia.setFrozenRows(1);
  
  // Eliminar columnas vacías a la derecha en Asistencia (máximo 10 columnas)
  const maxColsAsistencia = sheetAsistencia.getMaxColumns();
  const columnasRequeridasAsistencia = 10;
  if (maxColsAsistencia > columnasRequeridasAsistencia) {
    sheetAsistencia.deleteColumns(columnasRequeridasAsistencia + 1, maxColsAsistencia - columnasRequeridasAsistencia);
  }
  
  // Mostrar inicialmente solo 10 filas vacías bajo el encabezado en Asistencia
  const maxRowsAsistencia = sheetAsistencia.getMaxRows();
  if (sheetAsistencia.getLastRow() <= 1) {
    if (maxRowsAsistencia > 11) {
      sheetAsistencia.deleteRows(12, maxRowsAsistencia - 11);
    } else if (maxRowsAsistencia < 11) {
      sheetAsistencia.insertRowsAfter(maxRowsAsistencia, 11 - maxRowsAsistencia);
    }
  }
  
  // 2. Inicializar pestaña de Ajustes
  let sheetAjustes = ss.getSheetByName(TAB_AJUSTES);
  
  const valoresDefecto = [
    ["MEDIDA_GPS", "TRUE", "Exige geolocalización obligatoria para poder registrar asistencia (TRUE / FALSE)"],
    ["MEDIDA_SELFIE", "TRUE", "Activa el selfie obligatorio de verificación visual (TRUE / FALSE)"],
    ["CARPETA_DRIVE_ID", "", "ID de la carpeta de Drive donde se guardarán las fotos (Vacío = misma carpeta del Sheet)"],
    ["MEDIDA_BLOQUEO", "TRUE", "Activa el bloqueo local del dispositivo por tiempo (TRUE / FALSE)"],
    ["TIEMPO_CONTENCION_MIN", "15", "Minutos mínimos de espera en el dispositivo antes de permitir otro registro"],
    ["MEDIDA_HUELLA", "TRUE", "Activa el sistema de alertas por colisión rápida de huellas digitales (TRUE / FALSE)"],
    ["UMBRAL_HUELLA_SEG", "120", "Segundos máximos de tolerancia entre huellas idénticas antes de lanzar alarma"],
    ["VENTANA_BUSQUEDA_MIN", "15", "Minutos de historial a escanear en el servidor para detectar duplicados y aplicar cooldown"],
    ["ETIQUETA_ID", "NIA", "Texto identificativo que se mostrará en el formulario para solicitar la identificación del usuario (ej. NIA, DNI, NIE)"],
    ["MSG_BIENVENIDA", "Registro de asistencia", "Mensaje de bienvenida en la cabecera del formulario"],
    ["COLOR_ACENTO", "#475569", "Color hexadecimal para los botones y elementos de acento de la aplicación"],
    ["LOGO_URL", "", "URL de la imagen del logotipo de la cabecera (dejar vacío para mostrar icono por defecto)"],
    ["MSG_CONFIRMACION", "¡Registro verificado y guardado con éxito!", "Mensaje de éxito que se mostrará al usuario tras registrarse"],
    ["MOSTRAR_DIAGNOSTICO", "TRUE", "Muestra u oculta la caja de estado de sensores en el formulario (TRUE / FALSE)"]
  ];

  if (!sheetAjustes) {
    sheetAjustes = ss.insertSheet(TAB_AJUSTES);
    const cabecerasAjustes = ["Parámetro de Seguridad", "Valor", "Descripción / Instrucciones"];
    sheetAjustes.appendRow(cabecerasAjustes);
    
    sheetAjustes.getRange(2, 1, valoresDefecto.length, 3).setValues(valoresDefecto);
    sheetAjustes.getRange(1, 1, 1, 3)
      .setBackground("#334155")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
  } else {
    // Si la hoja ya existe, añadimos de manera incremental los ajustes que falten
    const ultimaFila = sheetAjustes.getLastRow();
    let clavesExistentes = [];
    if (ultimaFila > 1) {
      const datosExistentes = sheetAjustes.getRange(2, 1, ultimaFila - 1, 1).getValues();
      clavesExistentes = datosExistentes.map(fila => fila[0].toString().trim());
    }
    
    valoresDefecto.forEach(defecto => {
      if (!clavesExistentes.includes(defecto[0])) {
        sheetAjustes.appendRow(defecto);
      }
    });
  }

  // Congelar encabezado de Ajustes
  sheetAjustes.setFrozenRows(1);
  
  // Limpiar filas y columnas sobrantes en Ajustes (3 columnas y filas correspondientes a los parámetros)
  const maxRowsAjustes = sheetAjustes.getMaxRows();
  const maxColsAjustes = sheetAjustes.getMaxColumns();
  const filasRequeridasAjustes = sheetAjustes.getLastRow();
  const columnasRequeridasAjustes = 3;
  
  if (maxColsAjustes > columnasRequeridasAjustes) {
    sheetAjustes.deleteColumns(columnasRequeridasAjustes + 1, maxColsAjustes - columnasRequeridasAjustes);
  }
  if (maxRowsAjustes > filasRequeridasAjustes) {
    sheetAjustes.deleteRows(filasRequeridasAjustes + 1, maxRowsAjustes - filasRequeridasAjustes);
  }
  
  // Configurar ajuste de línea (wrap) en los encabezados de ambas tablas
  sheetAsistencia.getRange(1, 1, 1, 10).setWrap(true);
  sheetAjustes.getRange(1, 1, 1, 3).setWrap(true);
  
  // Redimensionar columnas en Ajustes
  if (sheetAjustes.getLastColumn() > 0) {
    sheetAjustes.autoResizeColumns(1, sheetAjustes.getLastColumn());
  }
  
  // Ocultar la hoja de Ajustes para evitar modificaciones accidentales
  sheetAjustes.hideSheet();
  
  // Etiquetar la hoja de cálculo con Developer Metadata
  ss.addDeveloperMetadata("fichaje_seguro_inicializado", new Date().toISOString());
}

/**
 * Lee los ajustes de seguridad configurados en la pestaña "Ajustes"
 * @returns {Object} Mapa clave-valor con los ajustes tipados.
 */
function obtenerAjustes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TAB_AJUSTES);
  if (!sheet) return {};
  
  const valoresDefecto = [
    ["MEDIDA_GPS", "TRUE", "Exige geolocalización obligatoria para poder registrar asistencia (TRUE / FALSE)"],
    ["MEDIDA_SELFIE", "TRUE", "Activa el selfie obligatorio de verificación visual (TRUE / FALSE)"],
    ["CARPETA_DRIVE_ID", "", "ID de la carpeta de Drive donde se guardarán las fotos (Vacío = misma carpeta del Sheet)"],
    ["MEDIDA_BLOQUEO", "TRUE", "Activa el bloqueo local del dispositivo por tiempo (TRUE / FALSE)"],
    ["TIEMPO_CONTENCION_MIN", "15", "Minutos mínimos de espera en el dispositivo antes de permitir otro registro"],
    ["MEDIDA_HUELLA", "TRUE", "Activa el sistema de alertas por colisión rápida de huellas digitales (TRUE / FALSE)"],
    ["UMBRAL_HUELLA_SEG", "120", "Segundos máximos de tolerancia entre huellas idénticas antes de lanzar alarma"],
    ["VENTANA_BUSQUEDA_MIN", "15", "Minutos de historial a escanear en el servidor para detectar duplicados y aplicar cooldown"],
    ["ETIQUETA_ID", "NIA", "Texto identificativo que se mostrará en el formulario para solicitar la identificación del usuario (ej. NIA, DNI, NIE)"],
    ["MSG_BIENVENIDA", "Registro de asistencia", "Mensaje de bienvenida en la cabecera del formulario"],
    ["COLOR_ACENTO", "#475569", "Color hexadecimal para los botones y elementos de acento de la aplicación"],
    ["LOGO_URL", "", "URL de la imagen del logotipo de la cabecera (dejar vacío para mostrar icono por defecto)"],
    ["MSG_CONFIRMACION", "¡Registro verificado y guardado con éxito!", "Mensaje de éxito que se mostrará al usuario tras registrarse"],
    ["MOSTRAR_DIAGNOSTICO", "TRUE", "Muestra u oculta la caja de estado de sensores en el formulario (TRUE / FALSE)"]
  ];
  
  const ultimaFila = sheet.getLastRow();
  const ajustes = {};
  if (ultimaFila < 2) {
    // Si la hoja está vacía por alguna razón, cargamos los valores por defecto
    valoresDefecto.forEach(defecto => {
      sheet.appendRow(defecto);
      const clave = defecto[0];
      const valor = defecto[1];
      if (valor.toUpperCase() === "TRUE") ajustes[clave] = true;
      else if (valor.toUpperCase() === "FALSE") ajustes[clave] = false;
      else if (!isNaN(valor) && valor !== "") ajustes[clave] = Number(valor);
      else ajustes[clave] = valor;
    });
    sheet.autoResizeColumns(1, sheet.getLastColumn());
    return ajustes;
  }
  
  const datos = sheet.getRange(2, 1, ultimaFila - 1, 2).getValues();
  const clavesExistentes = [];
  
  datos.forEach(fila => {
    const clave = fila[0].toString().trim();
    let valor = fila[1].toString().trim();
    clavesExistentes.push(clave);
    
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
  
  // Agregar de forma no destructiva cualquier parámetro nuevo que se haya definido en el código
  let huboCambios = false;
  valoresDefecto.forEach(defecto => {
    const claveDefecto = defecto[0];
    if (!clavesExistentes.includes(claveDefecto)) {
      sheet.appendRow(defecto);
      const valorDefecto = defecto[1];
      if (valorDefecto.toUpperCase() === "TRUE") {
        ajustes[claveDefecto] = true;
      } else if (valorDefecto.toUpperCase() === "FALSE") {
        ajustes[claveDefecto] = false;
      } else if (!isNaN(valorDefecto) && valorDefecto !== "") {
        ajustes[claveDefecto] = Number(valorDefecto);
      } else {
        ajustes[claveDefecto] = valorDefecto;
      }
      huboCambios = true;
    }
  });
  
  if (huboCambios) {
    // Si se añadieron nuevas filas de configuración, aseguramos que la hoja siga teniendo las dimensiones ajustadas
    const maxRowsAjustes = sheet.getMaxRows();
    const filasRequeridasAjustes = sheet.getLastRow();
    if (maxRowsAjustes > filasRequeridasAjustes) {
      sheet.deleteRows(filasRequeridasAjustes + 1, maxRowsAjustes - filasRequeridasAjustes);
    }
    sheet.autoResizeColumns(1, sheet.getLastColumn());
  }
  
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
      enlaceMapa = `=HYPERLINK("https://www.google.com/maps?q=${datos.latitud},${datos.longitud}"; "📍 Ver Mapa")`;
    }
    
    // --- ACCIÓN 1: PROCESAR SELFIE (Guardado seguro en Drive) ---
    if (ajustes.MEDIDA_SELFIE) {
      if (!datos.fotoBase64) {
        throw new Error("El sistema requiere que te tomes una foto de verificación.");
      }
      
      // Determinar la carpeta destino
      let carpetaDestino;
      if (ajustes.CARPETA_DRIVE_ID && ajustes.CARPETA_DRIVE_ID.trim() !== "") {
        carpetaDestino = DriveApp.getFolderById(extraerIdCarpeta(ajustes.CARPETA_DRIVE_ID));
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
      urlFoto = archivoFoto.getUrl();
    }
    
    // --- ACCIÓN 3: VERIFICACIÓN Y AUDITORÍA DE SEGURIDAD (Cooldown y Huella Digital por ventana de tiempo) ---
    const ultimaFila = sheet.getLastRow();
    if (ultimaFila > 1) {
      const tiempoActualMs = fechaActual.getTime();
      const ventanaBusquedaMs = (ajustes.VENTANA_BUSQUEDA_MIN || 15) * 60 * 1000;
      const umbralBloqueoMs = ajustes.TIEMPO_CONTENCION_MIN * 60 * 1000;
      const umbralHuellaMs = ajustes.UMBRAL_HUELLA_SEG * 1000;
      
      // Leemos en bloques de 500 filas de atrás hacia adelante para optimizar rendimiento
      const tamañoBloque = 500;
      let filaInicio = ultimaFila;
      let continuarBucle = true;
      
      while (filaInicio > 1 && continuarBucle) {
        const cantidadALeer = Math.min(tamañoBloque, filaInicio - 1);
        const rangoInicio = filaInicio - cantidadALeer;
        const datosBloque = sheet.getRange(rangoInicio, 1, cantidadALeer, 10).getValues();
        
        // Iteramos el bloque de atrás hacia adelante (de la última fila hacia la primera del bloque)
        for (let i = datosBloque.length - 1; i >= 0; i--) {
          const registroFecha = new Date(datosBloque[i][0]);
          const diferenciaTiempoMs = Math.abs(tiempoActualMs - registroFecha.getTime());
          
          // Si el registro es más antiguo que la ventana de búsqueda, paramos
          if (diferenciaTiempoMs > ventanaBusquedaMs) {
            continuarBucle = false;
            break;
          }
          
          const registroEstudiante = datosBloque[i][1].toString().trim();
          const registroHuella = datosBloque[i][6];
          
          // 1. Verificación de bloqueo por tiempo (cooldown en servidor)
          if (ajustes.MEDIDA_BLOQUEO && diferenciaTiempoMs < umbralBloqueoMs) {
            if (registroEstudiante === datos.nombre) {
              throw new Error(`Este NIA (${datos.nombre}) ya ha sido registrado recientemente. Por favor, espera.`);
            }
            if (datos.fingerprint && registroHuella === datos.fingerprint) {
              throw new Error("Este dispositivo ya ha registrado una asistencia recientemente. Por favor, espera.");
            }
          }
          
          // 2. Detección de colisión rápida de huellas (mismo dispositivo, diferente usuario)
          if (ajustes.MEDIDA_HUELLA && datos.fingerprint && registroHuella === datos.fingerprint) {
            if (diferenciaTiempoMs < umbralHuellaMs && registroEstudiante !== datos.nombre) {
              alertaHuella = `¡ALERTA! Mismo dispositivo detectado con '${registroEstudiante}' hace ${Math.round(diferenciaTiempoMs/1000)} seg.`;
            }
          }
        }
        
        filaInicio -= cantidadALeer;
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
    
    return ajustes.MSG_CONFIRMACION || "¡Registro verificado y guardado con éxito!";
    
  } catch (error) {
    return "Error en el servidor: " + error.message;
  }
}

/**
 * Crea el menú personalizado al abrir la hoja de cálculo.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔒 Fichaje Seguro')
      .addItem('⚙️ Inicializar sistema', 'inicializarSistemaDesdeMenu')
      .addSeparator()
      .addItem('🔧 Configurar parámetros', 'abrirAjustesUI')
      .addItem('🚀 Guía de despliegue', 'abrirDespliegueUI')
      .addSeparator()
      .addItem('📱 Mostrar código QR', 'abrirQrUI')
      .addItem('📊 Panel de control', 'abrirDashboardUI')
      .addSeparator()
      .addItem('🧪 Generar datos de prueba', 'generarDatosDePrueba')
      .addSeparator()
      .addItem('ℹ️ Acerca de...', 'abrirAcercaDe')
      .addToUi();
}

/**
 * Abre el diálogo de configuración de parámetros.
 */
function abrirAjustesUI() {
  const html = HtmlService.createTemplateFromFile('AjustesUI');
  const ajustes = obtenerAjustes();
  html.ajustes = JSON.stringify(ajustes);
  
  const output = html.evaluate()
      .setWidth(600)
      .setHeight(700)
      .setTitle('Configuración de Fichaje Seguro');
  SpreadsheetApp.getUi().showModalDialog(output, 'Configuración de Fichaje Seguro');
}

/**
 * Guarda los ajustes enviados por el diálogo de configuración en la pestaña Ajustes.
 */
function guardarAjustes(datos) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(TAB_AJUSTES);
    if (!sheet) throw new Error("La pestaña de Ajustes no existe.");
    
    const ultimaFila = sheet.getLastRow();
    if (ultimaFila < 2) return "No hay ajustes para guardar.";
    
    const rangoClaves = sheet.getRange(2, 1, ultimaFila - 1, 1).getValues();
    
    for (let i = 0; i < rangoClaves.length; i++) {
      const clave = rangoClaves[i][0].toString().trim();
      const fila = i + 2;
      
      if (datos.hasOwnProperty(clave)) {
        let valor = datos[clave];
        if (clave === "CARPETA_DRIVE_ID") {
          valor = extraerIdCarpeta(valor);
        }
        if (typeof valor === "boolean") {
          valor = valor ? "TRUE" : "FALSE";
        }
        sheet.getRange(fila, 2).setValue(valor);
      }
    }
    
    return "¡Ajustes guardados con éxito!";
  } catch (e) {
    return "Error al guardar ajustes: " + e.message;
  }
}

/**
 * Extrae el ID de una carpeta de Google Drive si se proporciona una URL.
 * Si ya es un ID, lo devuelve tal cual.
 * @param {String} entrada Cadena con el ID o URL de la carpeta.
 * @returns {String} El ID limpio de la carpeta.
 */
function extraerIdCarpeta(entrada) {
  if (!entrada) return "";
  const entradaStr = entrada.toString().trim();
  const regexDrive = /\/folders\/([a-zA-Z0-9-_]+)/;
  const match = entradaStr.match(regexDrive);
  return match && match[1] ? match[1] : entradaStr;
}

/**
 * Abre el diálogo de atribución/acerca de.
 */
function abrirAcercaDe() {
  const html = HtmlService.createHtmlOutputFromFile('AcercaDe')
      .setWidth(450)
      .setHeight(520)
      .setTitle('Acerca de Fichaje Seguro');
  SpreadsheetApp.getUi().showModalDialog(html, 'Acerca de Fichaje Seguro');
}

/**
 * Abre el diálogo con la guía de despliegue web de la aplicación.
 */
function abrirDespliegueUI() {
  const html = HtmlService.createHtmlOutputFromFile('DespliegueUI')
      .setWidth(500)
      .setHeight(550)
      .setTitle('Guía de despliegue');
  SpreadsheetApp.getUi().showModalDialog(html, 'Guía de despliegue');
}

/**
 * Abre el diálogo de panel de mando / dashboard de asistencia.
 */
function abrirDashboardUI() {
  const html = HtmlService.createHtmlOutputFromFile('DashboardUI')
      .setWidth(1150)
      .setHeight(950)
      .setTitle('Panel de Control - Fichaje Seguro');
  SpreadsheetApp.getUi().showModalDialog(html, 'Panel de Control - Fichaje Seguro');
}

/**
 * Recupera todos los registros de asistencia para procesarlos en el Dashboard.
 */
function obtenerDatosDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TAB_ASISTENCIA);
  if (!sheet) return [];
  
  const ultimaFila = sheet.getLastRow();
  if (ultimaFila < 2) return [];
  
  const datos = sheet.getRange(2, 1, ultimaFila - 1, 10).getValues();
  const registros = datos.map(fila => {
    let fechaISO = "";
    if (fila[0] instanceof Date) {
      fechaISO = fila[0].toISOString();
    } else {
      fechaISO = new Date(fila[0]).toISOString();
    }
    
    return {
      fecha: fechaISO,
      nombre: fila[1].toString(),
      latitud: fila[2],
      longitud: fila[3],
      fotoUrl: fila[5].toString(),
      fingerprint: fila[6].toString(),
      resolucion: fila[7].toString(),
      userAgent: fila[8].toString(),
      alerta: fila[9].toString()
    };
  });
  
  return registros;
}

/**
 * Genera 50 registros de prueba con simulaciones de comportamiento correcto e intentos de fraude.
 * Detecta si ya hay datos y solicita confirmación si es necesario.
 */
function generarDatosDePrueba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TAB_ASISTENCIA);
  if (!sheet) {
    ejecutarInicializacionLimpia();
    sheet = ss.getSheetByName(TAB_ASISTENCIA);
  }
  
  const ultimaFila = sheet.getLastRow();
  if (ultimaFila > 1) {
    const html = HtmlService.createHtmlOutputFromFile('ConfirmMockDataUI')
        .setWidth(500)
        .setHeight(380)
        .setTitle('Confirmar datos de prueba');
    SpreadsheetApp.getUi().showModalDialog(html, 'Confirmar datos de prueba');
  } else {
    const respuesta = ejecutarGeneracionDatosDePrueba();
    mostrarNotificacion("Datos de prueba", respuesta, "exito");
  }
}

/**
 * Lógica real de generación de datos de prueba.
 */
function ejecutarGeneracionDatosDePrueba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TAB_ASISTENCIA);
  if (!sheet) {
    ejecutarInicializacionLimpia();
    sheet = ss.getSheetByName(TAB_ASISTENCIA);
  }
  
  // Limpiar datos existentes (salvando la cabecera)
  const ultimaFila = sheet.getLastRow();
  if (ultimaFila > 1) {
    sheet.getRange(2, 1, ultimaFila - 1, sheet.getLastColumn()).clearContent().clearFormat();
  }
  
  // Asegurarnos de tener exactamente 51 filas totales en la hoja (1 cabecera + 50 de datos)
  const maxRows = sheet.getMaxRows();
  const filasNecesarias = 51;
  if (maxRows > filasNecesarias) {
    sheet.deleteRows(filasNecesarias + 1, maxRows - filasNecesarias);
  } else if (maxRows < filasNecesarias) {
    sheet.insertRowsAfter(maxRows, filasNecesarias - maxRows);
  }
  
  const baseTime = new Date().getTime();
  const datos = [];
  
  // Generar 50 registros distribuidos temporalmente a lo largo de 15 días
  for (let i = 1; i <= 50; i++) {
    // Espaciado promedio de 7.2 horas por registro para cubrir 15 días
    const offsetMs = i * 7.2 * 60 * 60 * 1000;
    let fecha = new Date(baseTime - offsetMs);
    let nombre = "Usua" + (1000 + i);
    let lat = 40.45305 + (Math.random() - 0.5) * 0.002;
    let lng = -3.72701 + (Math.random() - 0.5) * 0.002;
    let fingerprint = "FGP_STUD_" + (1000 + i).toString(16).toUpperCase();
    let urlFoto = "https://lh3.googleusercontent.com/d/mock_photo_id_" + i;
    let resolucion = "390x844";
    let alertaHuella = "NO";
    let enlaceMapa = `=HYPERLINK("https://www.google.com/maps?q=${lat},${lng}"; "📍 Ver mapa")`;
    
    // Simulación de fraude 1: Colisión rápida de huellas (mismo dispositivo en 10 seg)
    if (i === 15 || i === 16 || i === 17) {
      fecha = new Date(baseTime - 15 * 7.2 * 60 * 60 * 1000 - (i - 15) * 10 * 1000);
      fingerprint = "FGP_FRAUDE_01";
      nombre = "Usua" + (1000 + i);
      if (i > 15) {
        alertaHuella = `¡ALERTA! Mismo dispositivo detectado con 'Usua${1000 + i - 1}' hace 10 seg.`;
      }
    }
    
    // Simulación de fraude 2: Colisión rápida de huellas (mismo dispositivo en 40 seg)
    if (i === 30 || i === 31) {
      fecha = new Date(baseTime - 30 * 7.2 * 60 * 60 * 1000 - (i - 30) * 40 * 1000);
      fingerprint = "FGP_FRAUDE_02";
      nombre = "Usua" + (1000 + i);
      if (i > 30) {
        alertaHuella = `¡ALERTA! Mismo dispositivo detectado con 'Usua1030' hace 40 seg.`;
      }
    }

    // Caso especial 3: Sin GPS
    if (i === 22 || i === 44) {
      lat = "";
      lng = "";
      enlaceMapa = "No proporcionado";
    }

    // Caso especial 4: Sin foto
    if (i === 12 || i === 35) {
      urlFoto = "No requerida";
    }
    
    // Lista de agentes de usuario simulados para dar variedad
    const agentesDeUsuario = [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15",
      "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36",
      "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0"
    ];
    
    let baseUA = agentesDeUsuario[i % agentesDeUsuario.length];
    if (fingerprint === "FGP_FRAUDE_01") {
      baseUA = agentesDeUsuario[1];
    } else if (fingerprint === "FGP_FRAUDE_02") {
      baseUA = agentesDeUsuario[2];
    }
    const userAgent = `${baseUA} (Hash: ${fingerprint})`;
    
    datos.push([
      fecha,
      nombre,
      lat || "No disponible",
      lng || "No disponible",
      enlaceMapa,
      urlFoto,
      fingerprint,
      resolucion,
      userAgent,
      alertaHuella
    ]);
  }
  
  // Escribir en orden cronológico (del más antiguo al más nuevo)
  datos.reverse();
  sheet.getRange(2, 1, datos.length, 10).setValues(datos);
  
  return "¡50 registros de prueba creados con éxito en la pestaña Asistencia!";
}

/**
 * Muestra una notificación personalizada usando la estética de la aplicación.
 * @param {String} titulo Título de la notificación.
 * @param {String} mensaje Mensaje detallado.
 * @param {String} tipo Tipo de alerta ("exito", "error", "alerta", "info").
 */
function mostrarNotificacion(titulo, mensaje, tipo = "exito") {
  const template = HtmlService.createTemplateFromFile('NotificacionUI');
  template.titulo = titulo;
  template.mensaje = mensaje;
  template.tipo = tipo;
  
  const html = template.evaluate()
      .setWidth(450)
      .setHeight(320)
      .setTitle(titulo);
  SpreadsheetApp.getUi().showModalDialog(html, titulo);
}

/**
 * Inicializa y registra de forma automática la URL de producción del script.
 * Se ejecuta de manera transparente dentro de doGet(e).
 *
 * @return {string} La URL activa del servicio (/exec o /dev).
 */
function registrarYObtenerUrl() {
  const propiedades = PropertiesService.getScriptProperties();
  let urlRegistrada = propiedades.getProperty("WEBAPP_URL");

  // Obtenemos la URL del contexto de ejecución actual
  const urlActual = ScriptApp.getService().getUrl();

  // Si la URL actual es de producción (/exec) y es distinta a la guardada (o no existe)
  if (urlActual && urlActual.indexOf("/exec") !== -1 && urlActual !== urlRegistrada) {
    propiedades.setProperty("WEBAPP_URL", urlActual);
    urlRegistrada = urlActual;
    console.log("Se ha registrado automáticamente la nueva URL de producción: " + urlActual);
  }

  return urlRegistrada || urlActual;
}

/**
 * Devuelve la URL registrada en las propiedades del script.
 */
function obtenerUrlAsistencia() {
  const propiedades = PropertiesService.getScriptProperties();
  const urlRegistrada = propiedades.getProperty("WEBAPP_URL");
  return urlRegistrada || "";
}

/**
 * Guarda manualmente la URL proporcionada por el administrador en las propiedades del script.
 */
function guardarUrlManual(url) {
  try {
    const urlLimpia = url.trim();
    if (!urlLimpia || urlLimpia.indexOf("https://") !== 0) {
      throw new Error("URL inválida. Debe comenzar con https://");
    }
    const propiedades = PropertiesService.getScriptProperties();
    propiedades.setProperty("WEBAPP_URL", urlLimpia);
    return "URL guardada con éxito.";
  } catch (e) {
    throw new Error("Error al guardar la URL: " + e.message);
  }
}

/**
 * Abre el diálogo con el código QR para fichaje.
 */
function abrirQrUI() {
  const html = HtmlService.createTemplateFromFile('QrUI');
  const urlBase = obtenerUrlAsistencia();
  html.webAppUrl = urlBase;
  
  const output = html.evaluate()
      .setWidth(550)
      .setHeight(580)
      .setTitle('Código QR de Fichaje');
  SpreadsheetApp.getUi().showModalDialog(output, 'Código QR de Fichaje');
}