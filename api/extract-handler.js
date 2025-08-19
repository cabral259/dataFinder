import formidable from 'formidable-serverless';
import pdfParse from 'pdf-parse';
import { generateExcel } from '../utils/excel.js';
import { extractWithAI } from '../utils/extractor.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log('🚀 API extract-handler iniciada');
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
    return res.status(405).json({ 
      success: false, 
      error: 'Método no permitido',
      method: req.method 
    });
  }

  try {
    console.log('📁 Iniciando procesamiento de formulario...');
    
    // Configurar formidable-serverless
    const form = formidable({
      maxFileSize: 5 * 1024 * 1024, // 5MB
      allowEmptyFiles: false,
      filter: function ({name, originalFilename, mimetype}) {
        console.log('🔍 Archivo detectado:', { name, originalFilename, mimetype });
        return mimetype && mimetype.includes("pdf") || mimetype && mimetype.includes("text");
      }
    });

    console.log('🔄 Iniciando form.parse()...');
    
    // Procesar el formulario
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('❌ Error en form.parse():', err);
          reject(err);
        } else {
          console.log('✅ form.parse() completado exitosamente');
          console.log('📋 Fields recibidos:', Object.keys(fields));
          console.log('📁 Files recibidos:', Object.keys(files));
          resolve([fields, files]);
        }
      });
    });

    console.log('🔍 Verificando archivo subido...');
    
    // Verificar que se recibió un archivo
    const uploadedFile = files.file;
    if (!uploadedFile) {
      console.log('❌ No se encontró archivo en files.file');
      console.log('📁 Archivos disponibles:', Object.keys(files));
      return res.status(400).json({ 
        success: false, 
        error: 'No se subió archivo',
        availableFiles: Object.keys(files)
      });
    }

    console.log('📊 Información del archivo:');
    console.log('  - Nombre:', uploadedFile.originalFilename);
    console.log('  - Tamaño:', uploadedFile.size, 'bytes');
    console.log('  - Tipo:', uploadedFile.mimetype);
    console.log('  - Path:', uploadedFile.filepath);

    // Verificar que el archivo no esté vacío
    if (!uploadedFile.size || uploadedFile.size === 0) {
      console.log('❌ Archivo vacío detectado');
      return res.status(400).json({ 
        success: false, 
        error: 'El archivo está vacío',
        fileSize: uploadedFile.size
      });
    }

    console.log('📖 Leyendo archivo como buffer...');
    
    // Leer el archivo como buffer
    const fs = require('fs');
    const buffer = fs.readFileSync(uploadedFile.filepath);
    
    console.log('✅ Buffer leído:', buffer.length, 'bytes');

    if (buffer.length === 0) {
      console.log('❌ Buffer vacío');
      return res.status(400).json({ 
        success: false, 
        error: 'No se pudo leer el contenido del archivo',
        bufferLength: buffer.length
      });
    }

    console.log('🔍 Procesando contenido del archivo...');
    
    let extractedText = '';
    const { mimetype, originalFilename } = uploadedFile;

    if (mimetype === 'application/pdf') {
      try {
        console.log('📄 Procesando PDF...');
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text;
        console.log('✅ PDF procesado:', extractedText.length, 'caracteres');
      } catch (pdfError) {
        console.error('❌ Error procesando PDF:', pdfError);
        return res.status(500).json({ 
          success: false, 
          error: 'Error procesando PDF: ' + pdfError.message 
        });
      }
    } else {
      console.log('📝 Procesando como texto...');
      extractedText = buffer.toString('utf8');
      console.log('✅ Texto extraído:', extractedText.length, 'caracteres');
    }

    if (!extractedText || extractedText.length === 0) {
      console.log('❌ No se pudo extraer texto');
      return res.status(500).json({ 
        success: false, 
        error: 'No se pudo extraer texto del archivo',
        textLength: extractedText.length
      });
    }

    console.log('📋 Configurando campos a extraer...');
    
    // Configurar campos a extraer
    let requestedFields = ['Número de orden', 'ID de carga', 'Código de artículo', 'Cantidad'];
    try {
      if (fields.fields) {
        console.log('📋 Campos personalizados recibidos:', fields.fields);
        const parsedFields = JSON.parse(fields.fields);
        if (Array.isArray(parsedFields) && parsedFields.length > 0) {
          requestedFields = parsedFields;
        }
      }
    } catch (e) {
      console.warn('⚠️ Error parseando campos:', e.message);
    }

    console.log('📋 Campos finales:', requestedFields);

    console.log('🤖 Iniciando extracción con IA...');
    
    // Extraer datos con IA
    const extractedData = await extractWithAI(extractedText, requestedFields);
    
    if (!extractedData || extractedData.length === 0) {
      console.log('❌ No se pudieron extraer datos');
      return res.status(500).json({ 
        success: false, 
        error: 'No se pudieron extraer datos del archivo',
        extractedDataLength: extractedData ? extractedData.length : 0
      });
    }

    console.log('✅ Datos extraídos:', extractedData.length, 'campos');

    // Estructurar datos para Excel
    const structuredData = extractedData.map(item => ({
      label: item.nombre,
      value: item.valor,
    }));

    console.log('📊 Generando Excel...');
    
    // Generar Excel
    const excelBuffer = await generateExcel(structuredData);
    
    console.log('✅ Excel generado:', excelBuffer.length, 'bytes');

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="datos_extraidos.xlsx"');
    res.setHeader('Content-Length', excelBuffer.length);

    console.log('📤 Enviando respuesta...');
    
    // Enviar respuesta
    res.send(excelBuffer);
    
    console.log('✅ Respuesta enviada exitosamente');

  } catch (error) {
    console.error('❌ Error general:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor: ' + error.message,
      stack: error.stack
    });
  }
}
