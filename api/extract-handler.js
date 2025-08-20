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

IMPORTANTE para cantidades: Extrae el número COMPLETO con la unidad (ej: "1 QQ", "100 UND", "250 QQ")

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
      // Buscar cantidades con UND o QQ
      const match = textoPlano.match(/\d+\s+(UND|QQ)/i);
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

// Función para limpiar cantidades y extraer solo números
function cleanQuantity(quantityText) {
  console.log('🔢 cleanQuantity input:', `"${quantityText}"`);
  
  if (!quantityText) {
    console.log('🔢 cleanQuantity: texto vacío, retornando ""');
    return '';
  }
  
  // Extraer número de la cantidad (ej: "1 QQ" -> "1", "100 UND" -> "100")
  const numberMatch = quantityText.match(/(\d+)/);
  if (numberMatch) {
    console.log('🔢 cleanQuantity: número encontrado:', numberMatch[1]);
    return numberMatch[1];
  }
  
  // Fallback: remover sufijos
  const cleaned = quantityText.replace(/\s+UND.*/, '').replace(/\s+QQ.*/, '').trim();
  console.log('🔢 cleanQuantity: fallback, resultado:', `"${cleaned}"`);
  return cleaned;
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

  // Mostrar todos los datos extraídos para debugging
  console.log('📊 Datos estructurados recibidos de Gemini:');
  data.forEach((item, index) => {
    console.log(`${index + 1}. ${item.nombre}: "${item.valor}"`);
  });

  // Replicar exactamente la lógica local
  const records = [];
  let currentOrder = '';
  let currentArticleCode = '';
  let currentQuantities = [];
  
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const label = item.nombre || '';
    const value = item.valor || '';
    
    console.log(`🔍 Procesando campo ${i + 1}: "${label}" = "${value}"`);
    
    if (label.toLowerCase().includes('número de orden') || label.toLowerCase().includes('numero de orden')) {
      // Si tenemos datos acumulados del artículo anterior, crear registro
      if (currentOrder && currentArticleCode) {
        if (currentQuantities.length > 0) {
          // Usar la primera cantidad (no sumar)
          records.push({
            loadId: loadId,
            orderNumber: currentOrder,
            articleCode: currentArticleCode,
            quantity: cleanQuantity(currentQuantities[0])
          });
          console.log(`📝 Registro creado: ${currentOrder} | ${currentArticleCode} | ${currentQuantities[0]}`);
        } else {
          records.push({
            loadId: loadId,
            orderNumber: currentOrder,
            articleCode: currentArticleCode,
            quantity: ''
          });
        }
      }
      
      // Iniciar nuevo registro
      currentOrder = value;
      currentArticleCode = '';
      currentQuantities = [];
      
    } else if (label.toLowerCase().includes('código de artículo') || label.toLowerCase().includes('codigo de articulo')) {
      // Si tenemos datos acumulados del artículo anterior, crear registro
      if (currentOrder && currentArticleCode) {
        if (currentQuantities.length > 0) {
          // Usar la primera cantidad (no sumar)
          records.push({
            loadId: loadId,
            orderNumber: currentOrder,
            articleCode: currentArticleCode,
            quantity: cleanQuantity(currentQuantities[0])
          });
          console.log(`📝 Registro creado: ${currentOrder} | ${currentArticleCode} | ${currentQuantities[0]}`);
        } else {
          records.push({
            loadId: loadId,
            orderNumber: currentOrder,
            articleCode: currentArticleCode,
            quantity: ''
          });
        }
      }
      
      currentArticleCode = value;
      currentQuantities = [];
      
    } else if (label.toLowerCase().includes('cantidad')) {
      console.log('🔢 Cantidad encontrada:', `"${value}"`);
      currentQuantities.push(value);
    }
  }

  // Agregar el último registro pendiente
  if (currentOrder && currentArticleCode) {
    if (currentQuantities.length > 0) {
      records.push({
        loadId: loadId,
        orderNumber: currentOrder,
        articleCode: currentArticleCode,
        quantity: currentQuantities[0].replace(/\s+UND.*/, '')
      });
      console.log(`📝 Último registro creado: ${currentOrder} | ${currentArticleCode} | ${currentQuantities[0]}`);
    } else {
      records.push({
        loadId: loadId,
        orderNumber: currentOrder,
        articleCode: currentArticleCode,
        quantity: ''
      });
    }
  }
  
  console.log('📊 Registros agrupados:', records.length, 'registros creados');

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
