const Busboy = require('busboy');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ExcelJS = require('exceljs');

// Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function extractWithAI(textoPlano, camposSolicitados) {
  try {
    console.log('🤖 Iniciando extracción con Gemini Flash...');
    
    if (!textoPlano || textoPlano.length === 0) {
      console.log('❌ Error: Texto vacío');
      return [];
    }
    
    if (!process.env.GEMINI_API_KEY) {
      console.log('❌ Error: API key no configurada');
      return [];
    }
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8000
      }
    });
    
    // Determinar el tipo de documento basado en los campos solicitados
    let documentType = 'generic';
    if (camposSolicitados.includes('ID de carga') && camposSolicitados.includes('Código de artículo')) {
      documentType = 'corvi';
    } else if (camposSolicitados.includes('Cantidad de bultos') && camposSolicitados.includes('Código de cliente')) {
      documentType = 'farmaconal';
    } else if (camposSolicitados.includes('Cantidad de cajas') && !camposSolicitados.includes('Código de cliente')) {
      documentType = 'casa-cuesta';
    }

    let prompt = `Extrae estos campos: ${camposSolicitados.join(', ')}

Documento: ${textoPlano.substring(0, 15000)}

`;
    
    // Debug: mostrar el texto que se envía a Gemini
    console.log('🔍 Texto enviado a Gemini (primeros 500 chars):', textoPlano.substring(0, 500));

    // Agregar instrucciones específicas según el tipo de documento
    if (documentType === 'farmaconal') {
      prompt += `INSTRUCCIONES ESPECÍFICAS PARA FARMACONAL:
- "Número de orden": Busca el número después de "Conduce:" (ejemplo: si ves "Conduce: 16422", el número de orden es "16422")
- "Nombre del cliente": Busca el nombre después de "Cliente:"
- "Número de teléfono": Busca el número después de "Telefono:"
- "Dirección": Busca la dirección después de "Direccion:"
- "Código de cliente": Busca el número después de "Factura:"
- "Cantidad de bultos": Busca el número antes de "BULTO(S) o CAJA(S)"

IMPORTANTE: Si encuentras "Conduce:" seguido de un número, ese es el "Número de orden". NO devuelvas "null" para este campo.

`;
    } else if (documentType === 'corvi') {
      prompt += `INSTRUCCIONES ESPECÍFICAS PARA CORVI:
- "Número de orden": Busca patrones como CPOV-XXXXX o CAOV-XXXXX
- "ID de carga": Busca patrones como CG-XXXXX
- "Código de artículo": Busca códigos de producto
- "Cantidad": Busca cantidades con UND o QQ

`;
    } else if (documentType === 'casa-cuesta') {
      prompt += `INSTRUCCIONES ESPECÍFICAS PARA CASA CUESTA:
- "Número de orden": Busca el número de orden
- "Cantidad de cajas": Busca el número antes de "CAJA(S)"
- "Nombre del cliente": Busca el nombre del cliente
- "Número de teléfono": Busca el número de teléfono
- "Dirección": Busca la dirección de entrega

`;
    }

    prompt += `IMPORTANTE: Extrae las cantidades completas con números y unidades (ej: "1 QQ", "100 UND", "250 QQ")

Responde SOLO con JSON en este formato:
{"campos": [{"nombre": "campo", "valor": "valor"}]}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiResponse = response.text();
    
    // Limpiar respuesta
    let cleanResponse = aiResponse;
    if (aiResponse.includes('```json')) {
      cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    }
    
    // Parsear JSON
    const firstBrace = cleanResponse.indexOf('{');
    const lastBrace = cleanResponse.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      const jsonString = cleanResponse.substring(firstBrace, lastBrace + 1);
      const parsedData = JSON.parse(jsonString);
      
      if (parsedData.campos && Array.isArray(parsedData.campos)) {
        console.log(`✅ Gemini extrajo ${parsedData.campos.length} campos`);
        
        // Verificar cantidades extraídas
        parsedData.campos.forEach((campo, index) => {
          if (campo.nombre && campo.nombre.toLowerCase().includes('cantidad')) {
            console.log(`🔍 Cantidad ${index + 1}: "${campo.valor}"`);
          }
        });
        
        return parsedData.campos;
      }
    }
    
    console.log('⚠️ Fallback a extracción manual');
    return extractFieldsManually(textoPlano, camposSolicitados);
    
  } catch (error) {
    console.error('❌ Error en Gemini:', error.message);
    return extractFieldsManually(textoPlano, camposSolicitados);
  }
}

function extractFieldsManually(textoPlano, camposSolicitados) {
  console.log('🔍 Iniciando extracción manual...');
  const resultados = [];

  for (const campo of camposSolicitados) {
    let valor = 'No encontrado';
    
    // Patrones específicos para cada tipo de campo
    if (campo.toLowerCase().includes('número de orden') || campo.toLowerCase().includes('numero de orden')) {
      // Para Farmaconal: buscar "Conduce:" seguido de números
      const farmaconalMatch = textoPlano.match(/Conduce:\s*(\d+)/i);
      if (farmaconalMatch) {
        valor = farmaconalMatch[1];
        console.log('🔍 Número de orden encontrado (Farmaconal):', valor);
      } else {
        // Para CORVI: buscar patrones CPOV- o CAOV-
        const corviMatch = textoPlano.match(/CPOV-\d+|CAOV-\d+/i);
        if (corviMatch) {
          valor = corviMatch[0];
          console.log('🔍 Número de orden encontrado (CORVI):', valor);
        } else {
          console.log('🔍 No se encontró número de orden en el texto');
        }
      }
    } else if (campo.toLowerCase().includes('id de carga')) {
      const match = textoPlano.match(/CG-\d+/i);
      if (match) valor = match[0];
    } else if (campo.toLowerCase().includes('código de artículo') || campo.toLowerCase().includes('codigo de articulo')) {
      const match = textoPlano.match(/\d{3}-\d{4}|P\d{4}|\d{6}-\d{3}/i);
      if (match) valor = match[0];
    } else if (campo.toLowerCase().includes('nombre del cliente')) {
      // Para Farmaconal: buscar "Cliente:" seguido del nombre
      const match = textoPlano.match(/Cliente:\s*([^\n]+)/i);
      if (match) valor = match[1].trim();
    } else if (campo.toLowerCase().includes('número de teléfono') || campo.toLowerCase().includes('numero de telefono')) {
      // Para Farmaconal: buscar "Telefono:" seguido del número
      const match = textoPlano.match(/Telefono:\s*([^\n]+)/i);
      if (match) valor = match[1].trim();
    } else if (campo.toLowerCase().includes('dirección') || campo.toLowerCase().includes('direccion')) {
      // Para Farmaconal: buscar "Direccion:" seguido de la dirección
      const match = textoPlano.match(/Direccion:\s*([^\n]+)/i);
      if (match) valor = match[1].trim();
    } else if (campo.toLowerCase().includes('código de cliente') || campo.toLowerCase().includes('codigo de cliente')) {
      // Para Farmaconal: buscar "Factura:" como código de cliente
      const match = textoPlano.match(/Factura:\s*(\d+)/i);
      if (match) valor = match[1];
    } else if (campo.toLowerCase().includes('cantidad de bultos')) {
      // Para Farmaconal: buscar "X BULTO(S) o CAJA(S)"
      const match = textoPlano.match(/(\d+)\s+BULTO\(S\)\s+o\s+CAJA\(S\)/i);
      if (match) valor = match[1];
    } else if (campo.toLowerCase().includes('cantidad de cajas')) {
      // Para Casa Cuesta: buscar "X CAJA(S)"
      const match = textoPlano.match(/(\d+)\s+CAJA\(S\)/i);
      if (match) valor = match[1];
    } else if (campo.toLowerCase().includes('cantidad')) {
      console.log(`🔍 Buscando cantidad en texto de ${textoPlano.length} caracteres`);
      
      // Buscar cantidades con UND o QQ - ser más específico
      const matches = textoPlano.match(/\d+\s+(UND|QQ)/gi);
      console.log(`🔍 Cantidades encontradas con regex principal:`, matches);
      
      if (matches && matches.length > 0) {
        // Tomar la primera cantidad encontrada que no sea "0"
        for (const match of matches) {
          const number = match.match(/\d+/)[0];
          console.log(`🔍 Evaluando cantidad: "${match}" -> número: "${number}"`);
          if (number !== '0') {
            valor = match;
            console.log(`🔍 Cantidad seleccionada: "${valor}"`);
            break;
          }
        }
        // Si todas son "0", tomar la primera
        if (!valor || valor === 'No encontrado') {
          valor = matches[0];
          console.log(`🔍 Usando primera cantidad (todas eran 0): "${valor}"`);
        }
      }
      
      // Si no se encontró nada, buscar patrones más específicos
      if (!valor || valor === 'No encontrado') {
        console.log(`🔍 Buscando en líneas específicas...`);
        // Buscar en líneas que contengan códigos de artículo
        const lines = textoPlano.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('QQ') || line.includes('UND')) {
            console.log(`🔍 Línea ${i + 1} con QQ/UND: "${line.trim()}"`);
            // Buscar números de cualquier longitud antes de QQ o UND
            const quantityMatch = line.match(/(\d+)\s*(QQ|UND)/i);
            if (quantityMatch) {
              valor = quantityMatch[0];
              console.log(`🔍 Cantidad encontrada en línea ${i + 1}: "${line.trim()}" -> "${valor}"`);
              break;
            }
          }
        }
      }
      
      console.log(`🔍 Cantidad final para ${campo}: "${valor}"`);
    } else {
      // Patrón genérico
      const regex = new RegExp(`${campo}\\s*[:\\-]?\\s*(.+)`, 'i');
      const match = textoPlano.match(regex);
      if (match) valor = match[1].trim();
    }

    resultados.push({
      nombre: campo,
      valor: valor,
    });
  }

  return resultados;
}

// Función para limpiar cantidades y extraer solo números
function cleanQuantity(quantityText) {
  console.log('🔢 cleanQuantity input:', `"${quantityText}"`);
  
  if (!quantityText) {
    console.log('🔢 cleanQuantity: texto vacío, retornando ""');
    return '';
  }
  
  // Extraer número de la cantidad (ej: "1 QQ" -> "1", "100 UND" -> "100", "1500 QQ" -> "1500")
  // Usar regex más específico para capturar números antes de unidades
  const numberMatch = quantityText.match(/(\d+)\s*(QQ|UND)/i);
  if (numberMatch) {
    console.log('🔢 cleanQuantity: número encontrado:', numberMatch[1]);
    return numberMatch[1];
  }
  
  // Fallback: buscar cualquier número en el texto
  const fallbackMatch = quantityText.match(/(\d+)/);
  if (fallbackMatch) {
    console.log('🔢 cleanQuantity: fallback, número encontrado:', fallbackMatch[1]);
    return fallbackMatch[1];
  }
  
  // Último fallback: remover sufijos
  const cleaned = quantityText.replace(/\s+UND.*/, '').replace(/\s+QQ.*/, '').trim();
  console.log('🔢 cleanQuantity: último fallback, resultado:', `"${cleaned}"`);
  return cleaned;
}

async function generateExcel(data) {
  console.log('📊 Generando Excel con estructura dinámica...');
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Datos Extraídos');

  // Determinar las columnas dinámicamente basado en los campos únicos
  const uniqueFields = [];
  const seenFields = new Set();
  
  data.forEach(item => {
    if (!seenFields.has(item.nombre)) {
      seenFields.add(item.nombre);
      uniqueFields.push(item.nombre);
    }
  });
  
  const columnHeaders = uniqueFields;
  const columnKeys = uniqueFields.map(field => field.toLowerCase().replace(/\s+/g, ''));
  
  console.log('📋 Columnas dinámicas (únicas):', columnHeaders);
  
  // Configurar columnas dinámicamente
  const columns = columnHeaders.map((header, index) => ({
    header: header,
    key: columnKeys[index],
    width: Math.max(header.length * 2, 15)
  }));
  
  worksheet.columns = columns;

  // Mostrar todos los datos extraídos para debugging
  console.log('📊 Datos estructurados recibidos de Gemini:');
  data.forEach((item, index) => {
    console.log(`${index + 1}. ${item.nombre}: "${item.valor}"`);
  });

  // Procesar múltiples registros
  const registros = [];
  let registroActual = {};
  let contadorCampos = 0;
  const camposPorRegistro = columnHeaders.length; // 5 campos por registro

  data.forEach((item, index) => {
    const key = item.nombre.toLowerCase().replace(/\s+/g, '');
    registroActual[key] = item.valor;
    contadorCampos++;

    // Si completamos un registro (5 campos), agregarlo y reiniciar
    if (contadorCampos === camposPorRegistro) {
      registros.push({...registroActual});
      registroActual = {};
      contadorCampos = 0;
    }
  });

  // Si queda un registro incompleto, agregarlo también
  if (Object.keys(registroActual).length > 0) {
    registros.push(registroActual);
  }

  console.log('📊 Registros procesados:', registros.length);
  registros.forEach((registro, index) => {
    console.log(`📝 Registro ${index + 1}:`, registro);
  });

  // Agregar cada registro como una fila separada
  registros.forEach(registro => {
    worksheet.addRow(registro);
  });

  // Aplicar estilos básicos
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Generar buffer
  const buffer = await workbook.xlsx.writeBuffer();
  console.log('✅ Excel generado con estructura correcta:', buffer.length, 'bytes');
  
  return buffer;
}

async function handler(req, res) {
  console.log('🚀 API extract-handler iniciada con busboy');
  console.log('📋 Método:', req.method);
  console.log('🌐 URL:', req.url);
  console.log('📏 Content-Length:', req.headers['content-length']);

  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('✅ Preflight request manejado');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    console.log('❌ Método no permitido:', req.method);
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  try {
    console.log('📁 Iniciando procesamiento con busboy...');
    
    const busboy = Busboy({ 
      headers: req.headers,
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1
      }
    });

    let fileBuffer = null;
    let fileName = null;
    let fileMimeType = null;
    let fields = {};

    return new Promise((resolve, reject) => {
      busboy.on('file', (fieldname, file, info) => {
        console.log('📁 Archivo detectado:', fieldname, info.filename, info.mimeType);
        
        fileName = info.filename;
        fileMimeType = info.mimeType;
        
        const chunks = [];
        file.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
          console.log('✅ Archivo leído completamente:', fileBuffer.length, 'bytes');
        });
        
        file.on('error', (err) => {
          console.error('❌ Error leyendo archivo:', err);
          reject(err);
        });
      });

      busboy.on('field', (fieldname, value) => {
        console.log('📝 Campo recibido:', fieldname, value);
        fields[fieldname] = value;
      });

      busboy.on('finish', async () => {
        console.log('✅ Busboy terminó de procesar');
        
        try {
          if (!fileBuffer) {
            console.log('❌ No se recibió archivo');
            res.status(400).json({ success: false, error: 'No se subió archivo' });
            resolve();
            return;
          }

          if (fileBuffer.length === 0) {
            console.log('❌ Archivo vacío');
            res.status(400).json({ success: false, error: 'El archivo está vacío' });
            resolve();
            return;
          }

          console.log('📊 Procesando archivo:', fileName, fileBuffer.length, 'bytes', fileMimeType);

          // Extraer texto del archivo
          let extractedText = '';
          if (fileMimeType === 'application/pdf') {
            try {
              const pdfData = await pdfParse(fileBuffer);
              extractedText = pdfData.text;
              console.log('✅ PDF procesado:', extractedText.length, 'caracteres');
            } catch (pdfError) {
              console.error('❌ Error procesando PDF:', pdfError);
              res.status(500).json({ success: false, error: 'Error procesando PDF: ' + pdfError.message });
              resolve();
              return;
            }
          } else {
            extractedText = fileBuffer.toString('utf8');
            console.log('✅ Texto extraído:', extractedText.length, 'caracteres');
          }

          if (!extractedText || extractedText.length === 0) {
            console.log('❌ No se pudo extraer texto');
            res.status(500).json({ success: false, error: 'No se pudo extraer texto del archivo' });
            resolve();
            return;
          }

          // Procesar campos solicitados
          const requestedFields = fields.fields ? JSON.parse(fields.fields) : ['Número de orden', 'ID de carga', 'Código de artículo', 'Cantidad'];
          console.log('📋 Campos solicitados:', requestedFields);

          // Extraer datos con IA
          console.log('🤖 Iniciando extracción con IA...');
          const extractedData = await extractWithAI(extractedText, requestedFields);
          
          if (!extractedData || extractedData.length === 0) {
            console.log('❌ No se extrajeron datos');
            res.status(500).json({ success: false, error: 'No se pudieron extraer datos del archivo' });
            resolve();
            return;
          }

          console.log('✅ Datos extraídos:', extractedData.length, 'campos');
          console.log('🔍 Primeros 3 campos extraídos:');
          extractedData.slice(0, 3).forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.nombre}: "${item.valor}"`);
          });

          // Generar Excel
          console.log('📊 Generando Excel...');
          const excelBuffer = await generateExcel(extractedData);
          
          if (!excelBuffer) {
            console.log('❌ Error generando Excel');
            res.status(500).json({ success: false, error: 'Error generando archivo Excel' });
            resolve();
            return;
          }

          console.log('✅ Excel generado:', excelBuffer.length, 'bytes');

          // Enviar respuesta
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', 'attachment; filename="datos_extraidos.xlsx"');
          res.setHeader('Content-Length', excelBuffer.length);
          
          console.log('📤 Enviando respuesta exitosa');
          res.status(200).send(excelBuffer);
          resolve();

        } catch (error) {
          console.error('❌ Error en procesamiento:', error);
          res.status(500).json({ success: false, error: 'Error interno del servidor: ' + error.message });
          resolve();
        }
      });

      busboy.on('error', (err) => {
        console.error('❌ Error en busboy:', err);
        res.status(500).json({ success: false, error: 'Error procesando archivo: ' + err.message });
        resolve();
      });

      // Pipe el request a busboy
      req.pipe(busboy);
    });

  } catch (error) {
    console.error('❌ Error general:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor: ' + error.message });
  }
}

module.exports = handler;
