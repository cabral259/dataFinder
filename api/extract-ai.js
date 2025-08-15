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

// Función de extracción con IA
async function extractWithAI(text, requestedFields) {
    try {
        console.log('🤖 Iniciando extracción con Gemini Flash...');
        console.log('📋 Campos solicitados:', requestedFields);
        console.log('📄 Longitud del texto:', text.length);

        // Limitar el texto enviado a Gemini
        const maxTextLength = 100000;
        if (text.length > maxTextLength) {
            text = text.substring(0, maxTextLength);
            console.log(`📄 Texto truncado a ${maxTextLength} caracteres`);
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8000
            }
        });

        const prompt = `Extrae EXACTAMENTE estos campos: ${requestedFields.join(', ')}
        
        Documento: ${text.substring(0, 15000)}
        
        IMPORTANTE: Responde SOLO con UN objeto JSON en este formato exacto:
        {"campos": [{"nombre": "campo", "valor": "valor"}]}
        
        Reglas:
        - Extrae SOLO campos solicitados
        - Números de orden: valores únicos
        - ID de carga: puede repetirse
        - Cantidades: CADA instancia individual (no agrupar)
        - Extrae TODOS los artículos sin omitir
        - NO incluyas texto adicional, solo el JSON`;

        console.log('🤖 Enviando prompt a Gemini...');
        const startTime = Date.now();
        
        let aiResponse;
        try {
            const result = await model.generateContent(prompt);
            const endTime = Date.now();
            console.log(`⚡ Gemini respondió en ${endTime - startTime}ms`);
            const response = await result.response;
            aiResponse = response.text();
        } catch (geminiError) {
            console.error('❌ Error en Gemini:', geminiError.message);
            console.log('🔄 Usando extracción manual como fallback...');
            return extractFieldsManually(text, requestedFields);
        }

        console.log('🤖 Respuesta de Gemini recibida (longitud:', aiResponse.length, 'chars)');

        // Limpiar la respuesta de Gemini
        let cleanResponse = aiResponse;
        if (aiResponse.includes('```json')) {
            cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        }

        // Intentar parsear la respuesta JSON
        try {
            const firstBrace = cleanResponse.indexOf('{');
            const lastBrace = cleanResponse.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1) {
                const jsonString = cleanResponse.substring(firstBrace, lastBrace + 1);
                const parsedData = JSON.parse(jsonString);
                
                if (parsedData.campos && Array.isArray(parsedData.campos)) {
                    console.log(`✅ Gemini extrajo ${parsedData.campos.length} campos`);
                    return parsedData.campos;
                } else {
                    console.log('⚠️ Respuesta de Gemini no tiene el formato esperado');
                    return [];
                }
            } else {
                console.log('⚠️ No se encontró JSON válido en la respuesta');
                return [];
            }
        } catch (parseError) {
            console.log('⚠️ Error parseando JSON de Gemini:', parseError.message);
            return [];
        }
    } catch (error) {
        console.error('❌ Error en extracción con IA:', error);
        return [];
    }
}

// Función de extracción manual (fallback)
function extractFieldsManually(text, requestedFields) {
    console.log('🔍 Iniciando extracción manual...');
    const results = [];

    requestedFields.forEach(field => {
        const fieldLower = field.toLowerCase();
        
        if (fieldLower.includes('orden') || fieldLower.includes('order')) {
            const orderPatterns = [
                /CPOV-\d+/gi,
                /(?:Número de orden|Order):\s*([A-Z0-9\-]+)/gi
            ];
            
            const seenOrderNumbers = new Set();
            
            orderPatterns.forEach(pattern => {
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        const cleanMatch = match.trim();
                        if (!seenOrderNumbers.has(cleanMatch)) {
                            seenOrderNumbers.add(cleanMatch);
                            results.push({ nombre: field, valor: cleanMatch });
                            console.log(`✅ Encontrado orden único: ${cleanMatch}`);
                        }
                    });
                }
            });
        } else if (fieldLower.includes('carga') || fieldLower.includes('load')) {
            const loadPatterns = [
                /CG-\d+/gi,
                /(?:ID de carga|Load ID):\s*([A-Z0-9\-]+)/gi
            ];
            
            loadPatterns.forEach(pattern => {
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        results.push({ nombre: field, valor: match.trim() });
                        console.log(`✅ Encontrado ID de carga: ${match.trim()}`);
                    });
                }
            });
        } else if (fieldLower.includes('artículo') || fieldLower.includes('article')) {
            const articlePatterns = [
                /([A-Z\s\d\/\"\-\'\.]+(?:SONACA|CORVI)[A-Z\s\d\/\"\-\'\.]*)/gi,
                /(?:Nombre de artículo|Article Name):\s*([^\n]+)/gi
            ];
            
            articlePatterns.forEach(pattern => {
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        const cleanMatch = match.trim();
                        if (cleanMatch.length > 5) {
                            results.push({ nombre: field, valor: cleanMatch });
                            console.log(`✅ Encontrado nombre de artículo: ${cleanMatch}`);
                        }
                    });
                }
            });
        } else if (fieldLower.includes('cantidad')) {
            const quantityPatterns = [
                /\d+\s+(?:UND|UNIDADES|PCS|PIEZAS)/gi,
                /(?:Cantidad|Quantity):\s*(\d+)/gi,
                /(\d+)\s+UND/gi
            ];
            
            quantityPatterns.forEach(pattern => {
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        results.push({ nombre: field, valor: match.trim() });
                        console.log(`✅ Encontrado cantidad: ${match.trim()}`);
                    });
                }
            });
        }
    });

    console.log(`📊 Total de campos encontrados manualmente: ${results.length}`);
    return results;
}

// Función para generar Excel
function generateExcel(structuredData) {
    console.log('📊 Generando Excel con', structuredData.length, 'campos extraídos...');
    
    const workbook = XLSX.utils.book_new();
    const allData = [];

    // Crear encabezados
    const headers = ['ID de carga', 'Número de orden', 'Nombre de artículo', 'Cantidad'];
    allData.push(headers);

    // Agrupar datos por categoría
    const groupedData = {};
    structuredData.forEach(item => {
        const category = item.label || item.nombre;
        if (!groupedData[category]) {
            groupedData[category] = [];
        }
        groupedData[category].push(item.value || item.valor);
    });

    // Obtener ID de carga (siempre el primero)
    const loadIds = groupedData['ID de carga'] || [];
    const loadId = loadIds.length > 0 ? loadIds[0] : '';

    // Obtener todos los números de orden únicos
    const orderNumbers = groupedData['Número de orden'] || [];
    const uniqueOrders = [...new Set(orderNumbers)];

    // Obtener todos los nombres de artículos
    const articleNames = groupedData['Nombre de artículo'] || [];

    // Obtener todas las cantidades
    const quantities = groupedData['Cantidad'] || [];

    // Crear registros combinando los datos
    const records = [];
    
    // Para cada orden, buscar sus artículos y cantidades asociadas
    uniqueOrders.forEach(orderNumber => {
        // Buscar artículos que pertenecen a esta orden
        const orderArticles = articleNames.filter((_, index) => {
            // Aquí asumimos que los artículos están en el mismo orden que las órdenes
            // En un caso real, necesitarías una lógica más sofisticada para asociar órdenes con artículos
            return true; // Por ahora, incluimos todos los artículos
        });

        // Buscar cantidades asociadas
        const orderQuantities = quantities.filter((_, index) => {
            return true; // Por ahora, incluimos todas las cantidades
        });

        // Crear un registro por cada artículo
        orderArticles.forEach((articleName, index) => {
            const quantity = orderQuantities[index] || '';
            records.push({
                loadId: loadId,
                orderNumber: orderNumber,
                articleName: articleName,
                quantity: quantity
            });
        });
    });

    // Si no hay registros, crear uno vacío
    if (records.length === 0) {
        records.push({
            loadId: loadId,
            orderNumber: orderNumbers[0] || '',
            articleName: articleNames[0] || '',
            quantity: quantities[0] || ''
        });
    }

    console.log('📊 Registros agrupados:', records.length, 'registros creados');

    // Crear filas de datos
    records.forEach(record => {
        const row = [
            record.loadId,
            record.orderNumber,
            record.articleName,
            record.quantity
        ];
        allData.push(row);
    });

    console.log('📊 Tabla final:', allData.length, 'filas generadas');

    const mainWorksheet = XLSX.utils.aoa_to_sheet(allData);

    // Aplicar estilos básicos
    mainWorksheet['!cols'] = [
        { width: 20 },  // ID de carga
        { width: 25 },  // Número de orden
        { width: 50 },  // Nombre de artículo
        { width: 15 }   // Cantidad
    ];

    XLSX.utils.book_append_sheet(workbook, mainWorksheet, 'Datos Extraídos');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// Función principal de la API para Vercel
module.exports = async (req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Manejar preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verificar API key
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'API Key de Gemini no configurada'
            });
        }

        // Procesar archivos usando multer
        upload.array('files')(req, res, async (err) => {
            if (err) {
                console.error('❌ Error en multer:', err);
                return res.status(400).json({
                    success: false,
                    error: 'Error procesando archivos'
                });
            }

            try {
                const files = req.files || [];
                if (files.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'No se subieron archivos'
                    });
                }

                const requestedFields = req.body.fields ? JSON.parse(req.body.fields) : [];
                
                if (requestedFields.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'No se especificaron campos para extraer'
                    });
                }

                console.log('🤖 Iniciando extracción con IA para campos:', requestedFields);

                // Extraer texto del archivo
                let extractedText = '';
                const file = files[0];
                
                if (file.mimetype === 'application/pdf') {
                    // Para PDF, usar extracción simple por ahora
                    try {
                        // Intentar extraer texto básico del PDF
                        const pdfParse = require('pdf-parse');
                        const pdfData = await pdfParse(file.buffer);
                        extractedText = pdfData.text;
                        console.log(`📄 Texto extraído del PDF: ${extractedText.length} caracteres`);
                    } catch (pdfError) {
                        console.error('❌ Error extrayendo PDF:', pdfError.message);
                        // Si falla, usar texto básico pero no datos de ejemplo
                        extractedText = 'PDF procesado - contenido no extraíble';
                    }
                } else {
                    extractedText = file.buffer.toString('utf8');
                }

                // Extraer datos
                const extractedData = await extractWithAI(extractedText, requestedFields);

                if (extractedData.length === 0) {
                    return res.status(500).json({
                        success: false,
                        error: 'No se pudieron extraer datos del archivo'
                    });
                }

                // Generar Excel
                const excelBuffer = generateExcel(extractedData);

                // Enviar respuesta
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="datos_extraidos.xlsx"');
                res.send(excelBuffer);

            } catch (error) {
                console.error('❌ Error en la API:', error);
                res.status(500).json({
                    success: false,
                    error: error.message || 'Error interno del servidor'
                });
            }
        });

    } catch (error) {
        console.error('❌ Error general:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error interno del servidor'
        });
    }
};
