const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const XLSX = require('xlsx');

// Configuración de multer para Vercel
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    }
});

// Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Función de extracción con IA simplificada
async function extractWithAI(text, requestedFields) {
    try {
        console.log('🤖 Iniciando extracción con Gemini Flash...');
        
        if (!text || text.length === 0) {
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
        
        const prompt = `Extrae estos campos: ${requestedFields.join(', ')}

Documento: ${text.substring(0, 15000)}

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
        return extractFieldsManually(text, requestedFields);
        
    } catch (error) {
        console.error('❌ Error en Gemini:', error.message);
        return extractFieldsManually(text, requestedFields);
    }
}

// Función de extracción manual simplificada
function extractFieldsManually(text, requestedFields) {
    console.log('🔍 Iniciando extracción manual...');
    const results = [];
    
    // Buscar números de orden
    const orderMatches = text.match(/CPOV-\d+/gi);
    if (orderMatches) {
        orderMatches.forEach(match => {
            results.push({ nombre: 'Número de orden', valor: match.trim() });
        });
    }
    
    // Buscar IDs de carga
    const loadMatches = text.match(/CG-\d+/gi);
    if (loadMatches) {
        loadMatches.forEach(match => {
            results.push({ nombre: 'ID de carga', valor: match.trim() });
        });
    }
    
    // Buscar códigos de artículo
    const articleMatches = text.match(/\d{3}-\d{4}|P\d{4}|\d{6}-\d{3}/gi);
    if (articleMatches) {
        articleMatches.forEach(match => {
            results.push({ nombre: 'Código de artículo', valor: match.trim() });
        });
    }
    
    // Buscar cantidades
    const quantityMatches = text.match(/\d+\s+UND/gi);
    if (quantityMatches) {
        quantityMatches.forEach(match => {
            results.push({ nombre: 'Cantidad', valor: match.trim() });
        });
    }
    
    console.log(`📊 Extracción manual: ${results.length} campos`);
    return results;
}

// Función para generar Excel simplificada
function generateExcel(structuredData) {
    console.log('📊 Generando Excel...');
    
    const workbook = XLSX.utils.book_new();
    const allData = [];

    // Encabezados
    const headers = ['ID de carga', 'Número de orden', 'Código de artículo', 'Cantidad'];
    allData.push(headers);

    // Agrupar datos
    const groupedData = {};
    structuredData.forEach(item => {
        const category = item.label;
        if (!groupedData[category]) {
            groupedData[category] = [];
        }
        groupedData[category].push(item.value);
    });

    // Crear registros
    const loadIds = groupedData['ID de carga'] || [];
    const orderNumbers = groupedData['Número de orden'] || [];
    const articleCodes = groupedData['Código de artículo'] || [];
    const quantities = groupedData['Cantidad'] || [];

    const maxLength = Math.max(orderNumbers.length, articleCodes.length, quantities.length);
    
    for (let i = 0; i < maxLength; i++) {
        const row = [
            loadIds[0] || '',
            orderNumbers[i] || '',
            articleCodes[i] || '',
            quantities[i] ? quantities[i].replace(/\s+UND.*/, '') : ''
        ];
        allData.push(row);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(allData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos Extraídos');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// Función principal para Vercel
module.exports = async (req, res) => {
    console.log('🚀 API iniciada - Método:', req.method);
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'Método no permitido'
        });
    }

    try {
        // Procesar archivo
        upload.single('file')(req, res, async (err) => {
            if (err) {
                console.error('❌ Error multer:', err);
                return res.status(400).json({
                    success: false,
                    error: 'Error procesando archivo'
                });
            }

            try {
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        error: 'No se subió archivo'
                    });
                }

                console.log('📁 Archivo recibido:', req.file.originalname, req.file.size, 'bytes');

                // Extraer texto
                let extractedText = '';
                
                if (req.file.mimetype === 'application/pdf') {
                    try {
                        const pdfParse = require('pdf-parse');
                        const pdfData = await pdfParse(req.file.buffer);
                        extractedText = pdfData.text;
                        console.log('✅ PDF procesado:', extractedText.length, 'caracteres');
                    } catch (pdfError) {
                        console.error('❌ Error PDF:', pdfError.message);
                        return res.status(500).json({
                            success: false,
                            error: 'Error procesando PDF'
                        });
                    }
                } else {
                    extractedText = req.file.buffer.toString('utf8');
                }

                // Campos solicitados
                const fields = req.body.fields ? JSON.parse(req.body.fields) : [];
                const requestedFields = fields.length > 0 ? fields : ['Número de orden', 'ID de carga', 'Código de artículo', 'Cantidad'];

                // Extraer datos
                const extractedData = await extractWithAI(extractedText, requestedFields);
                
                if (extractedData.length === 0) {
                    return res.status(500).json({
                        success: false,
                        error: 'No se pudieron extraer datos'
                    });
                }

                // Formatear datos
                const structuredData = extractedData.map(item => ({
                    label: item.nombre,
                    value: item.valor
                }));

                // Generar Excel
                const excelBuffer = generateExcel(structuredData);

                // Enviar respuesta
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="datos_extraidos.xlsx"');
                res.send(excelBuffer);

            } catch (error) {
                console.error('❌ Error interno:', error);
                res.status(500).json({
                    success: false,
                    error: 'Error interno del servidor'
                });
            }
        });

    } catch (error) {
        console.error('❌ Error general:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
};
