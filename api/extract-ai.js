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

// Función de extracción con IA (EXACTAMENTE IGUAL QUE LOCAL)
async function extractWithAI(text, requestedFields) {
    try {
        console.log('🤖 Iniciando extracción con Gemini Flash (lógica LOCAL)...');
        console.log('📋 Campos solicitados:', requestedFields);
        console.log('📄 Longitud del texto:', text.length);
        
        // Si el texto está vacío, devolver error
        if (!text || text.length === 0) {
            console.log('❌ Error: No se pudo extraer texto del documento');
            return [];
        }
        
        // Optimización: Limitar el tamaño del texto para mejor rendimiento
        const maxTextLength = 100000; // 100KB máximo (aumentado para archivos más grandes)
        if (text.length > maxTextLength) {
            console.log(`⚠️ Texto muy largo (${text.length} chars). Truncando a ${maxTextLength} chars para mejor rendimiento...`);
            text = text.substring(0, maxTextLength);
        }
        
        // Verificar que la API key esté configurada
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'demo-key') {
            console.log('❌ Error: API key de Gemini no configurada');
            return [];
        }
        
        // Verificar que la API key sea válida (debe empezar con AIza)
        if (!process.env.GEMINI_API_KEY.startsWith('AIza')) {
            console.log('❌ Error: API key de Gemini no es válida (debe empezar con AIza)');
            console.log('🔑 API key actual:', process.env.GEMINI_API_KEY.substring(0, 20) + '...');
            console.log('📝 Por favor, obtén una API key válida en: https://aistudio.google.com/');
            return [];
        }
        
        // Usar Gemini Flash para extracción inteligente con timeout optimizado
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
        
        // Limpiar la respuesta de Gemini (remover markdown si existe)
        let cleanResponse = aiResponse;
        if (aiResponse.includes('```json')) {
            cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        }
        
        // Intentar parsear la respuesta JSON
        try {
            // Si hay múltiples objetos JSON, tomar solo el primero
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
            console.log('📄 Respuesta recibida (primeros 500 chars):', aiResponse.substring(0, 500));
            return [];
        }
        
    } catch (error) {
        console.error('❌ Error en extracción con Gemini:', error);
        console.log('🔄 Usando extracción manual como fallback...');
        return extractFieldsManually(text, requestedFields);
    }
}

// Función de extracción manual como fallback (EXACTAMENTE IGUAL QUE LOCAL)
function extractFieldsManually(text, requestedFields) {
    console.log('🔍 Iniciando extracción manual...');
    const results = [];
    
    requestedFields.forEach(field => {
        const fieldLower = field.toLowerCase().trim();
        console.log(`🔍 Buscando campo: "${field}"`);
        
        if (fieldLower.includes('orden') || fieldLower.includes('order')) {
            // Buscar números de orden
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
            
            // Para cada orden encontrada, buscar sus artículos asociados
            const orderNumbers = Array.from(seenOrderNumbers);
            orderNumbers.forEach(orderNumber => {
                // Buscar artículos asociados a esta orden
                const orderSection = text.split(orderNumber)[1] || text;
                const articleMatches = orderSection.match(/([A-Z\s\d\/\"\-\'\.]+(?:SONACA|CORVI)[A-Z\s\d\/\"\-\'\.]*)/gi);
                
                if (articleMatches) {
                    articleMatches.forEach(article => {
                        const cleanArticle = article.trim();
                        if (cleanArticle.length > 10) { // Filtrar artículos válidos
                            results.push({ nombre: 'Nombre de artículo', valor: cleanArticle });
                            console.log(`✅ Encontrado artículo: ${cleanArticle}`);
                        }
                    });
                }
            });
        }
        
        if (fieldLower.includes('carga') || fieldLower.includes('load')) {
            // Buscar IDs de carga (sin eliminar duplicados)
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
        }
        
        if (fieldLower.includes('envío') || fieldLower.includes('envio') || fieldLower.includes('shipment')) {
            // Buscar IDs de envío
            const shipmentPatterns = [
                /ENV-\d+/gi,
                /(?:ID de envío|Shipment ID):\s*([A-Z0-9\-]+)/gi
            ];
            
            shipmentPatterns.forEach(pattern => {
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        results.push({ nombre: field, valor: match.trim() });
                        console.log(`✅ Encontrado ID de envío: ${match.trim()}`);
                    });
                }
            });
        }
        
        if (fieldLower.includes('código artículo') || fieldLower.includes('codigo articulo') || fieldLower.includes('article code')) {
            // Buscar códigos de artículo (formato Pxxxx)
            const articleCodePatterns = [
                /P\d{4,}/gi,
                /(?:Código de artículo|Article Code):\s*([A-Z0-9\-]+)/gi
            ];
            
            articleCodePatterns.forEach(pattern => {
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        results.push({ nombre: field, valor: match.trim() });
                        console.log(`✅ Encontrado código de artículo: ${match.trim()}`);
                    });
                }
            });
        }
        
        if (fieldLower.includes('nombre de artículo') || fieldLower.includes('nombre de articulo') || fieldLower.includes('article name')) {
            // Buscar nombres de artículos
            const articleNamePatterns = [
                /(?:Nombre de artículo|Article Name):\s*([^\n]+)/gi,
                /(?:TUBOS|TUBO)\s+[A-Z\s]+/gi
            ];
            
            articleNamePatterns.forEach(pattern => {
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        results.push({ nombre: field, valor: match.trim() });
                        console.log(`✅ Encontrado nombre de artículo: ${match.trim()}`);
                    });
                }
            });
        }
        
        if (fieldLower.includes('cantidad')) {
            // Buscar cantidades (EXACTAMENTE COMO LOCAL)
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
            
            // Buscar cantidades en formato específico del documento
            const specificQuantityMatches = text.match(/(\d+)\s+UND/gi);
            if (specificQuantityMatches) {
                specificQuantityMatches.forEach(match => {
                    results.push({ nombre: field, valor: match.trim() });
                    console.log(`✅ Encontrado cantidad específica: ${match.trim()}`);
                });
            }
        }
    });
    
    console.log(`📊 Total de campos encontrados manualmente: ${results.length}`);
    return results;
}

// Función para generar Excel (LÓGICA MEJORADA PARA MANTENER RELACIONES)
function generateExcel(structuredData) {
    console.log('📊 Generando Excel con lógica LOCAL mejorada...');
    console.log('📊 Datos estructurados recibidos:', structuredData.length, 'campos');
    
    const workbook = XLSX.utils.book_new();
    const allData = [];

    // Crear encabezados
    const headers = ['ID de carga', 'Número de orden', 'Nombre de artículo', 'Cantidad'];
    allData.push(headers);

    // Agrupar datos por categoría
    const groupedData = {};
    structuredData.forEach(item => {
        const category = item.label;
        if (!groupedData[category]) {
            groupedData[category] = [];
        }
        groupedData[category].push(item.value);
    });

    console.log('📊 Datos agrupados:', groupedData);

    // Obtener datos agrupados
    const loadIds = groupedData['ID de carga'] || [];
    const orderNumbers = groupedData['Número de orden'] || [];
    const articleNames = groupedData['Nombre de artículo'] || [];
    const quantities = groupedData['Cantidad'] || [];

    console.log('📊 Datos extraídos:');
    console.log('- ID de carga:', loadIds);
    console.log('- Números de orden:', orderNumbers);
    console.log('- Nombres de artículos:', articleNames);
    console.log('- Cantidades:', quantities);

    // Crear registros manteniendo relaciones
    const records = [];
    const loadId = loadIds[0] || '';
    
    // Método 1: Procesar por órdenes y sus artículos asociados
    if (orderNumbers.length > 0 && articleNames.length > 0) {
        console.log('🔄 Procesando por relaciones orden-artículo...');
        
        // Crear un mapa de órdenes con sus artículos
        const orderArticleMap = new Map();
        
        // Buscar artículos asociados a cada orden en el texto original
        orderNumbers.forEach(orderNumber => {
            const orderSection = structuredData.find(item => 
                item.label === 'Nombre de artículo' && 
                item.value && 
                item.value.includes('TUBOS PVC')
            );
            
            if (orderSection) {
                if (!orderArticleMap.has(orderNumber)) {
                    orderArticleMap.set(orderNumber, []);
                }
                orderArticleMap.get(orderNumber).push(orderSection.value);
            }
        });
        
        console.log('📋 Mapa de relaciones orden-artículo:', orderArticleMap);
        
        // Crear registros para cada orden con sus artículos
        for (const [orderNumber, articles] of orderArticleMap) {
            articles.forEach(article => {
                // Buscar cantidad asociada a este artículo
                const quantity = quantities.find(q => {
                    // Buscar cantidad que esté cerca del artículo en el texto
                    return q && q.includes('UND');
                }) || '';
                
                records.push({
                    loadId: loadId,
                    orderNumber: orderNumber,
                    articleName: article,
                    quantity: quantity.replace(/\s+UND.*/, '') || ''
                });
                
                console.log(`📝 Registro creado: ${orderNumber} | ${article} | ${quantity}`);
            });
        }
    }
    
    // Método 2: Si no se crearon registros, usar método secuencial
    if (records.length === 0) {
        console.log('🔄 Usando método secuencial como fallback...');
        
        const maxLength = Math.max(orderNumbers.length, articleNames.length, quantities.length);
        
        for (let i = 0; i < maxLength; i++) {
            const record = {
                loadId: loadId,
                orderNumber: orderNumbers[i] || '',
                articleName: articleNames[i] || '',
                quantity: quantities[i] ? quantities[i].replace(/\s+UND.*/, '') : ''
            };
            
            records.push(record);
            console.log(`📝 Registro ${i + 1}: ${record.orderNumber} | ${record.articleName} | ${record.quantity}`);
        }
    }

    console.log('📊 Total de registros creados:', records.length);

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
    res.setHeader('X-Vercel-Cache-Bypass', 'true');
    res.setHeader('X-Deploy-Timestamp', Date.now().toString());

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
        const file = files[0];
        let extractedText = '';
        
        if (file.mimetype === 'application/pdf') {
                    console.log('📄 Procesando archivo PDF...');
                    try {
                        const pdfParse = require('pdf-parse');
                        const pdfData = await pdfParse(file.buffer);
                        extractedText = pdfData.text;
                        console.log(`✅ PDF procesado: ${extractedText.length} caracteres`);
                    } catch (pdfError) {
                        console.error('❌ Error procesando PDF:', pdfError.message);
                        return res.status(500).json({
                            success: false,
                            error: 'Error procesando archivo PDF'
                        });
                    }
                } else if (file.mimetype.includes('text/') || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    console.log('📄 Procesando archivo de texto...');
                    extractedText = file.buffer.toString('utf8');
                } else {
                    console.log('📄 Procesando archivo Excel...');
                    try {
                        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
                        const sheetNames = workbook.SheetNames;
                        const allData = [];
                        
                        sheetNames.forEach(sheetName => {
                            const worksheet = workbook.Sheets[sheetName];
                            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                            allData.push(...jsonData);
                        });
                        
                        extractedText = allData.map(row => row.join(' ')).join('\n');
                    } catch (excelError) {
                        console.error('❌ Error procesando Excel:', excelError.message);
                        return res.status(500).json({
                            success: false,
                            error: 'Error procesando archivo Excel'
                        });
                    }
                }
                
                console.log('📄 Texto extraído (primeros 500 chars):', extractedText.substring(0, 500));
                console.log('�� Longitud total del texto:', extractedText.length);

                // Extraer datos con IA mejorada
        console.log('🔍 Iniciando extracción con IA mejorada...');
        const extractedData = await extractWithAI(extractedText, requestedFields);
        console.log('📊 Datos extraídos con IA:', extractedData.length, 'campos');

        // LOGGING ESPECÍFICO PARA CANTIDADES
        console.log('🔍 ANÁLISIS ESPECÍFICO DE CANTIDADES:');
        const cantidades = extractedData.filter(item => 
            item.nombre && item.nombre.toLowerCase().includes('cantidad')
        );
        console.log('📊 Cantidades encontradas:', cantidades.length);
        cantidades.forEach((cantidad, index) => {
            console.log(`📊 Cantidad ${index + 1}: "${cantidad.valor}" (campo: "${cantidad.nombre}")`);
        });

        // Buscar cantidades en el texto original
        console.log('🔍 BUSCANDO CANTIDADES EN EL TEXTO ORIGINAL:');
        const quantityPatterns = [
            /\b(\d{1,4})\s*UND\b/gi,
            /\b(\d{1,4})\s*UNIDADES\b/gi,
            /\b(\d{1,4})\s+PCS\b/gi
        ];
        
        quantityPatterns.forEach((pattern, index) => {
            const matches = extractedText.match(pattern);
            console.log(`🔍 Patrón ${index + 1} (${pattern}):`, matches);
        });

        // Buscar números específicos mencionados en el documento
        console.log('🔍 BUSCANDO NÚMEROS ESPECÍFICOS:');
        const specificNumbers = ['18', '400', '160', '150', '3', '15', '40', '200'];
        specificNumbers.forEach(num => {
            const count = (extractedText.match(new RegExp(num, 'g')) || []).length;
            if (count > 0) {
                console.log(`🔍 Número "${num}" encontrado ${count} veces en el texto`);
            }
        });

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

        // USAR EXACTAMENTE LA MISMA LÓGICA QUE LOCAL
        console.log('🔄 Formateando resultados usando lógica LOCAL...');
        
        // Formatear resultados y eliminar duplicados de números de orden (LÓGICA LOCAL)
        const structuredData = [];
        const seenOrderNumbers = new Set();
        
        extractedData.forEach(field => {
            const isOrderNumber = field.nombre.toLowerCase().includes('número de orden') || 
                                 field.nombre.toLowerCase().includes('numero de orden') ||
                                 field.nombre.toLowerCase().includes('order number');
            
            if (isOrderNumber) {
                // Para números de orden, verificar duplicados
                if (!seenOrderNumbers.has(field.valor)) {
                    seenOrderNumbers.add(field.valor);
                    structuredData.push({
                        label: field.nombre,
                        value: field.valor
                    });
                }
            } else {
                // Para otras categorías, agregar normalmente
                structuredData.push({
                    label: field.nombre,
                    value: field.valor
                });
            }
        });
        
        console.log('📊 Datos estructurados (lógica LOCAL):', structuredData.length, 'campos');
        structuredData.forEach((item, index) => {
            console.log(`${index + 1}. ${item.label}: "${item.value}"`);
        });

        // Generar Excel usando la lógica LOCAL
        console.log('📊 Generando archivo Excel...');
        const excelBuffer = generateExcel(structuredData);

                // Enviar respuesta
                console.log('📤 Enviando archivo Excel...');
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
