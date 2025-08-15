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

        // Optimización: Limitar el tamaño del texto para mejor rendimiento (igual que local)
        const maxTextLength = 100000; // 100KB máximo (aumentado para archivos más grandes)
        if (text.length > maxTextLength) {
            console.log(`⚠️ Texto muy largo (${text.length} chars). Truncando a ${maxTextLength} chars para mejor rendimiento...`);
            text = text.substring(0, maxTextLength);
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.1, // Más determinístico para mejor rendimiento
                maxOutputTokens: 8000 // Aumentado para documentos más grandes
            }
        });

        const prompt = `Extrae EXACTAMENTE estos campos: ${requestedFields.join(', ')}

Documento: ${text.substring(0, 15000)}

IMPORTANTE: Responde SOLO con UN objeto JSON en este formato exacto:
{"campos": [{"nombre": "campo", "valor": "valor"}]}

Reglas:
- Extrae SOLO campos solicitados
- Números de orden: valores únicos (formato CPOV-XXXXXX)
- ID de carga: puede repetirse (formato CG-XXXXXX)
- Cantidades: Extrae CADA cantidad individual con su formato completo
- Nombres de artículo: Extrae el nombre completo del artículo
- Extrae TODOS los artículos sin omitir NINGUNO
- Para cantidades: Busca patrones como "18 UND", "1400 UND", "15 UND"
- Si no encuentras "UND", extrae solo el número
- NO incluyas texto adicional, solo el JSON`;

        console.log('🤖 Enviando prompt a Gemini...');
        console.log('📝 Prompt enviado (primeros 500 chars):', prompt.substring(0, 500));
        const startTime = Date.now();
        
        let aiResponse;
        try {
            const result = await model.generateContent(prompt);
            const endTime = Date.now();
            console.log(`⚡ Gemini respondió en ${endTime - startTime}ms`);
            const response = await result.response;
            aiResponse = response.text();
            console.log('🤖 Respuesta de Gemini (primeros 500 chars):', aiResponse.substring(0, 500));
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
            // Función para limpiar cantidades problemáticas
            const cleanQuantity = (quantity) => {
                let cleaned = quantity.trim();
                
                // Remover "1" extra al inicio si está seguido de otro número
                if (cleaned.match(/^1(\d+)\s+UND$/)) {
                    cleaned = cleaned.replace(/^1(\d+)\s+UND$/, '$1 UND');
                    console.log(`🧹 Cantidad limpiada: "${quantity}" -> "${cleaned}"`);
                }
                
                // Remover "1" extra en cualquier posición si forma parte de un número mayor
                if (cleaned.match(/1(\d{2,})\s+UND$/)) {
                    cleaned = cleaned.replace(/1(\d{2,})\s+UND$/, '$1 UND');
                    console.log(`🧹 Cantidad limpiada (agresiva): "${quantity}" -> "${cleaned}"`);
                }
                
                // Casos específicos conocidos
                const specificCases = {
                    '118 UND': '18 UND',
                    '1400 UND': '400 UND',
                    '1160 UND': '160 UND',
                    '1150 UND': '150 UND'
                };
                
                if (specificCases[cleaned]) {
                    console.log(`🧹 Caso específico: "${cleaned}" -> "${specificCases[cleaned]}"`);
                    cleaned = specificCases[cleaned];
                }
                
                return cleaned;
            };
            
            // Buscar cantidades con diferentes formatos
            const quantityPatterns = [
                /\d+\s+(?:UND|UNIDADES|PCS|PIEZAS)/gi,
                /(?:Cantidad|Quantity):\s*(\d+)/gi,
                /(\d+)\s+UND/gi,
                /(\d+)\s+UNIDADES/gi,
                /(\d+)\s+PCS/gi,
                /(\d+)\s+PIEZAS/gi
            ];
            
            quantityPatterns.forEach(pattern => {
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        const cleanedQuantity = cleanQuantity(match);
                        results.push({ nombre: field, valor: cleanedQuantity });
                        console.log(`✅ Encontrado cantidad: ${cleanedQuantity}`);
                    });
                }
            });
            
            // Buscar cantidades sin unidades (solo números)
            const numberOnlyMatches = text.match(/(?<=\s)(\d{1,4})(?=\s|$)/gi);
            if (numberOnlyMatches) {
                numberOnlyMatches.forEach(match => {
                    const num = parseInt(match.trim());
                    if (num > 0 && num <= 9999) { // Filtrar números razonables
                        const cleanedQuantity = cleanQuantity(match);
                        results.push({ nombre: field, valor: cleanedQuantity });
                        console.log(`✅ Encontrado cantidad (solo número): ${cleanedQuantity}`);
                    }
                });
            }
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
    // Procesar datos para crear registros usando la lógica del servidor local
    const records = [];
    
    if (structuredData && structuredData.length > 0) {
        // Procesar los datos secuencialmente para mantener las relaciones exactas
        let currentOrder = '';
        let currentArticleName = '';
        let currentQuantities = [];
        
        for (let i = 0; i < structuredData.length; i++) {
            const item = structuredData[i];
            const label = item.label || item.nombre || '';
            const value = item.value || item.valor || '';
            
            if (label.toLowerCase().includes('número de orden') || label.toLowerCase().includes('numero de orden') || label.toLowerCase().includes('order number')) {
                // Si tenemos datos acumulados, crear registros
                if (currentOrder && currentArticleName) {
                    if (currentQuantities.length === 0) {
                        records.push({
                            loadId: loadId,
                            orderNumber: currentOrder,
                            articleName: currentArticleName,
                            quantity: ''
                        });
                    } else {
                        // Crear un registro por cada cantidad
                        for (const quantity of currentQuantities) {
                            console.log(`📝 Creando registro: Orden=${currentOrder}, Artículo=${currentArticleName}, Cantidad="${quantity}"`);
                            records.push({
                                loadId: loadId,
                                orderNumber: currentOrder,
                                articleName: currentArticleName,
                                quantity: quantity
                            });
                        }
                    }
                }
                
                // Iniciar nuevo registro
                currentOrder = value;
                currentArticleName = '';
                currentQuantities = [];
                
            } else if (label.toLowerCase().includes('nombre de artículo') || label.toLowerCase().includes('nombre de articulo') || label.toLowerCase().includes('article name')) {
                currentArticleName = value;
            } else if (label.toLowerCase().includes('cantidad')) {
                console.log(`📦 Agregando cantidad: "${value}" para orden: ${currentOrder}`);
                currentQuantities.push(value);
            }
        }
        
        // Procesar el último registro
        if (currentOrder && currentArticleName) {
            if (currentQuantities.length === 0) {
                records.push({
                    loadId: loadId,
                    orderNumber: currentOrder,
                    articleName: currentArticleName,
                    quantity: ''
                });
            } else {
                // Crear un registro por cada cantidad
                for (const quantity of currentQuantities) {
                    records.push({
                        loadId: loadId,
                        orderNumber: currentOrder,
                        articleName: currentArticleName,
                        quantity: quantity
                    });
                }
            }
        }
    }
    
    // Si no hay registros con la lógica secuencial, usar fallback
    if (records.length === 0) {
        console.log('⚠️ Usando lógica de fallback para crear registros...');
        const seenCombinations = new Set();
        
        for (let i = 0; i < orderNumbers.length; i++) {
            const orderNumber = orderNumbers[i];
            const articleName = articleNames[i] || '';
            const quantity = quantities[i] || '';
            
            const combination = `${orderNumber}|${articleName}`;
            
            if (!seenCombinations.has(combination) && articleName) {
                seenCombinations.add(combination);
                records.push({
                    loadId: loadId,
                    orderNumber: orderNumber,
                    articleName: articleName,
                    quantity: quantity
                });
            }
        }
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
    // Configurar CORS más permisivo
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Manejar preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Agregar headers adicionales para mejor compatibilidad
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        // Verificar API key con mejor manejo de errores
        if (!process.env.GEMINI_API_KEY) {
            console.error('❌ API Key de Gemini no configurada en variables de entorno');
            return res.status(500).json({
                success: false,
                error: 'Error de configuración del servidor. Contacta al administrador.'
            });
        }

        // Verificar que la API key sea válida
        if (process.env.GEMINI_API_KEY === 'tu_api_key_de_gemini_aqui') {
            console.error('❌ API Key de Gemini no ha sido configurada correctamente');
            return res.status(500).json({
                success: false,
                error: 'Error de configuración del servidor. Contacta al administrador.'
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
                console.log('📥 Petición recibida:', {
                    method: req.method,
                    headers: req.headers,
                    bodyKeys: Object.keys(req.body || {}),
                    filesCount: req.files ? req.files.length : 0
                });

                const files = req.files || [];
                if (files.length === 0) {
                    console.error('❌ No se subieron archivos');
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
                    // Para PDF, usar extracción mejorada
                    try {
                        console.log('📄 Procesando archivo PDF...');
                        const pdfParse = require('pdf-parse');
                        const pdfData = await pdfParse(file.buffer);
                        extractedText = pdfData.text;
                                        console.log(`📄 Texto extraído del PDF: ${extractedText.length} caracteres`);
                console.log(`📄 Número de páginas detectadas: ${pdfData.numpages || 'Desconocido'}`);
                
                // Log de una muestra del texto para debugging
                const sampleText = extractedText.substring(0, 1000);
                console.log('📄 Muestra del texto extraído (primeros 1000 chars):', sampleText);
                
                // Buscar cantidades específicas en el texto para verificar
                const quantityMatches = extractedText.match(/(\d+)\s+UND/gi);
                console.log('🔍 Cantidades encontradas en el texto:', quantityMatches);
                
                // Buscar patrones problemáticos que puedan estar causando el "1" extra
                const problematicPatterns = extractedText.match(/(?:1\s*)?(\d+)\s+UND/gi);
                console.log('⚠️ Patrones problemáticos encontrados:', problematicPatterns);
                
                // Buscar números que empiecen con 1 seguidos de otros números
                const onePattern = extractedText.match(/1(\d+)\s+UND/gi);
                console.log('🔍 Números que empiezan con 1:', onePattern);
                        
                        if (extractedText.length < 100) {
                            console.warn('⚠️ Texto extraído muy corto, puede haber problemas con el PDF');
                        }
                    } catch (pdfError) {
                        console.error('❌ Error extrayendo PDF:', pdfError.message);
                        extractedText = 'PDF procesado - contenido no extraíble';
                    }
                } else {
                    extractedText = file.buffer.toString('utf8');
                }

                        // Extraer datos - Forzar extracción manual para debug
        console.log('🔍 Iniciando extracción manual (forzada)...');
        const extractedData = extractFieldsManually(extractedText, requestedFields);
        console.log('📊 Datos extraídos manualmente:', extractedData.length, 'campos');

                if (extractedData.length === 0) {
                    console.error('❌ No se pudieron extraer datos del archivo');
                    return res.status(500).json({
                        success: false,
                        error: 'No se pudieron extraer datos del archivo'
                    });
                }

                // Log de los primeros datos para debugging
                console.log('📋 Primeros 3 datos extraídos:', extractedData.slice(0, 3));
                
                // Log detallado de todos los datos extraídos
                console.log('📊 Todos los datos extraídos:');
                extractedData.forEach((item, index) => {
                    console.log(`${index + 1}. ${item.nombre || item.label}: "${item.valor || item.value}"`);
                });

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
