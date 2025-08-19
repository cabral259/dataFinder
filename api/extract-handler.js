import Busboy from 'busboy';
import pdfParse from 'pdf-parse';
import { generateExcel } from '../utils/excel.js';
import { extractWithAI } from '../utils/extractor.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

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
