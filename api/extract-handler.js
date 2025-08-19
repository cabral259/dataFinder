import formidable, { IncomingForm } from 'formidable';
import pdfParse from 'pdf-parse';
import { generateExcel } from '../utils/excel.js';
import { extractWithAI } from '../utils/extractor.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log('🚀 API iniciada - Método:', req.method, 'URL:', req.url);

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
    const form = new IncomingForm({ maxFileSize: 5 * 1024 * 1024 });
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('❌ Error al procesar formulario:', err);
        return res.status(400).json({ success: false, error: 'Error procesando archivo: ' + err.message });
      }

      const uploadedFile = files.file?.[0];
      if (!uploadedFile) {
        console.log('❌ No se subió archivo');
        return res.status(400).json({ success: false, error: 'No se subió archivo' });
      }

      const buffer = await uploadedFile.toBuffer();
      const { mimetype, originalFilename, size } = uploadedFile;

      console.log('📁 Archivo recibido:', originalFilename, size, 'bytes', mimetype);

      if (size === 0) {
        return res.status(400).json({ success: false, error: 'El archivo está vacío' });
      }

      let extractedText = '';
      if (mimetype === 'application/pdf') {
        try {
          const pdfData = await pdfParse(buffer);
          extractedText = pdfData.text;
          console.log('✅ PDF procesado:', extractedText.length, 'caracteres');
        } catch (pdfError) {
          return res.status(500).json({ success: false, error: 'Error procesando PDF: ' + pdfError.message });
        }
      } else {
        extractedText = buffer.toString('utf8');
        console.log('✅ Texto extraído:', extractedText.length, 'caracteres');
      }

      if (!extractedText || extractedText.length === 0) {
        return res.status(500).json({ success: false, error: 'No se pudo extraer texto del archivo' });
      }

      let requestedFields = ['Número de orden', 'ID de carga', 'Código de artículo', 'Cantidad'];
      try {
        if (fields.fields) {
          const parsedFields = JSON.parse(fields.fields);
          if (Array.isArray(parsedFields) && parsedFields.length > 0) {
            requestedFields = parsedFields;
          }
        }
      } catch (e) {
        console.warn('⚠️ Error parseando campos:', e.message);
      }

      console.log('📋 Campos solicitados:', requestedFields);

      const extractedData = await extractWithAI(extractedText, requestedFields);
      if (extractedData.length === 0) {
        return res.status(500).json({ success: false, error: 'No se pudieron extraer datos del archivo' });
      }

      const structuredData = extractedData.map(item => ({
        label: item.nombre,
        value: item.valor,
      }));

      const excelBuffer = await generateExcel(structuredData);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="datos_extraidos.xlsx"');
      res.send(excelBuffer);
      console.log('✅ Respuesta enviada exitosamente');
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor: ' + error.message });
  }
}
