import Busboy from 'busboy';
import pdfParse from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ExcelJS from 'exceljs';

export const config = {
  api: {
    bodyParser: false,
  },
};

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
    
    const prompt = `Extrae estos campos: ${camposSolicitados.join(', ')}

Documento: ${textoPlano.substring(0, 15000)}

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
      const match = textoPlano.match(/CPOV-\d+|CAOV-\d+/i);
      if (match) valor = match[0];
    } else if (campo.toLowerCase().includes('id de carga')) {
      const match = textoPlano.match(/CG-\d+/i);
      if (match) valor = match[0];
    } else if (campo.toLowerCase().includes('código de artículo') || campo.toLowerCase().includes('codigo de articulo')) {
      const match = textoPlano.match(/\d{3}-\d{4}|P\d{4}|\d{6}-\d{3}/i);
      if (match) valor = match[0];
    } else if (campo.toLowerCase().includes('cantidad')) {
      const match = textoPlano.match(/\d+\s+UND/i);
      if (match) valor = match[0];
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

async function generateExcel(data) {
  console.log('📊 Generando Excel con estructura correcta...');
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Datos Extraídos');

  // Configurar columnas específicas como en el servidor local
  worksheet.columns = [
    { header: 'ID de carga', key: 'loadId', width: 20 },
    { header: 'Número de orden', key: 'orderNumber', width: 25 },
    { header: 'Código de artículo', key: 'articleCode', width: 20 },
    { header: 'Cantidad', key: 'quantity', width: 15 },
  ];

  // Extraer ID de carga primero
  let loadId = '';
  for (const item of data) {
    if (item.nombre && item.nombre.toLowerCase().includes('id de carga')) {
      loadId = item.valor || '';
      break;
    }
  }

  console.log('📋 ID de carga encontrado:', loadId);

  // Agrupar datos por orden y artículo
  const records = [];
  let currentOrder = '';
  let currentArticleCode = '';
  let currentQuantities = [];

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const label = item.nombre || '';
    const value = item.valor || '';

          if (label.toLowerCase().includes('número de orden') || label.toLowerCase().includes('numero de orden')) {
        // NO guardar registro aquí - solo actualizar variables
        console.log(`📝 Procesando número de orden: ${value} (anterior: ${currentOrder})`);
        currentOrder = value;
        // NO resetear currentArticleCode para mantener continuidad
    } else if (label.toLowerCase().includes('código de artículo') || label.toLowerCase().includes('codigo de articulo')) {
      // NO guardar registro aquí - solo actualizar variables
      console.log(`📝 Procesando código de artículo: ${value} (anterior: ${currentArticleCode})`);
      currentArticleCode = value;
    } else if (label.toLowerCase().includes('cantidad')) {
      // Limpiar la cantidad de caracteres extra
      let cleanQuantity = value;
      
      console.log('🔢 Procesando cantidad original:', value);
      
      // Extraer solo los números del valor, ignorando UND, QQ, etc.
      const numberMatch = cleanQuantity.match(/\d+/);
      if (numberMatch) {
        cleanQuantity = numberMatch[0];
        console.log('🔢 Número extraído:', cleanQuantity);
      } else {
        // Si no hay números, limpiar sufijos manualmente
        if (cleanQuantity.includes('UND')) {
          cleanQuantity = cleanQuantity.replace(/\s*UND.*/, '');
        }
        if (cleanQuantity.includes('QQ')) {
          cleanQuantity = cleanQuantity.replace(/\s*QQ.*/, '');
        }
      }
      
      // Solo verificar si hay un "1" extra al principio si es un número muy largo
      if (cleanQuantity.startsWith('1') && cleanQuantity.length > 3) {
        const withoutOne = cleanQuantity.substring(1);
        // Solo aplicar si el número sin "1" es válido y tiene sentido (números grandes como 1750 -> 750)
        if (!isNaN(withoutOne) && withoutOne.length >= 3) {
          cleanQuantity = withoutOne;
          console.log('🔢 Cantidad corregida (1 extra eliminado):', cleanQuantity, 'de', value);
        }
      }
      
      console.log('🔢 Cantidad final procesada:', cleanQuantity);
      
      // SOLO guardar registro cuando se procesa una cantidad válida
      console.log(`🔍 Validando guardado: currentOrder=${currentOrder}, currentArticleCode=${currentArticleCode}, cleanQuantity=${cleanQuantity}`);
      if (currentOrder && currentArticleCode && cleanQuantity && cleanQuantity !== '') {
        records.push({ 
          loadId: loadId, 
          orderNumber: currentOrder, 
          articleCode: currentArticleCode, 
          quantity: cleanQuantity
        });
        console.log(`✅ Registro guardado (cantidad válida): ${currentOrder} | ${currentArticleCode} | ${cleanQuantity}`);
        // NO resetear currentArticleCode para mantener filas separadas
      } else {
        console.log(`❌ No se guardó registro: currentOrder=${currentOrder}, currentArticleCode=${currentArticleCode}, cleanQuantity=${cleanQuantity}`);
      }
    }
  }

  // NO guardar registros al final - solo cuando se procesa una cantidad válida
  console.log('📝 Procesamiento completado - registros guardados solo cuando se encontraron cantidades válidas');

  console.log('📊 Registros generados:', records.length);
  records.forEach((record, index) => {
    console.log(`${index + 1}. ${record.loadId} | ${record.orderNumber} | ${record.articleCode} | ${record.quantity}`);
  });

  // Agregar datos a la hoja
  if (records.length > 0) {
    records.forEach(record => {
      worksheet.addRow(record);
    });
  } else {
    // Si no hay registros, agregar una fila vacía
    worksheet.addRow(['', '', '', '']);
  }

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

export default async function handler(req, res) {
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
