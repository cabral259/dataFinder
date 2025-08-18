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

// Función alternativa usando pdfjs-dist para mejor extracción
async function extractPDFWithPdfJS(buffer) {
    try {
        console.log('🔄 Intentando extracción con pdfjs-dist...');
        
        // Importar pdfjs-dist dinámicamente
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        
        // Cargar el documento
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        
        console.log(`📄 PDF cargado: ${pdf.numPages} páginas`);
        
        // Extraer texto de cada página
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            console.log(`📄 Procesando página ${pageNum}/${pdf.numPages}`);
            
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Construir texto manteniendo la estructura original
            let pageText = '';
            let lastY = null;
            
            textContent.items.forEach(item => {
                // Agregar salto de línea si hay cambio significativo en Y
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                    pageText += '\n';
                }
                
                pageText += item.str;
                lastY = item.transform[5];
            });
            
            fullText += pageText + '\n\n'; // Separar páginas con doble salto
        }
        
        console.log(`✅ Extracción con pdfjs-dist exitosa: ${fullText.length} caracteres`);
        console.log('📄 Muestra del texto extraído (primeros 500 chars):', fullText.substring(0, 500));
        
        return fullText;
        
    } catch (error) {
        console.log('❌ Error con pdfjs-dist:', error.message);
        return null;
    }
}

// Función para corregir problemas específicos de Vercel
function fixVercelSpecificIssues(text) {
    console.log('🔧 Aplicando correcciones específicas para Vercel...');
    console.log('📄 Texto antes de correcciones (primeros 500 chars):', text.substring(0, 500));
    
    // Detectar y corregir el problema del "1" extra en cantidades
    // Buscar patrones como "1400 UND" que deberían ser "400 UND"
    const problematicPattern = /1(\d{3})\s+UND/gi;
    let correctedText = text;
    let corrections = [];
    
    let match;
    while ((match = problematicPattern.exec(text)) !== null) {
        const originalNumber = match[0]; // "1400 UND"
        const correctedNumber = match[1] + ' UND'; // "400 UND"
        
        // Verificar que no sea un número de orden válido
        const orderPattern = new RegExp(`CPOV-${match[1]}`, 'i');
        if (!orderPattern.test(text)) {
            // Verificación adicional: asegurar que no esté cerca de un número de orden
            const matchIndex = text.indexOf(originalNumber);
            const beforeText = text.substring(Math.max(0, matchIndex - 50), matchIndex);
            const afterText = text.substring(matchIndex + originalNumber.length, matchIndex + originalNumber.length + 50);
            
            // Solo corregir si no hay contexto de número de orden cerca
            if (!beforeText.includes('CPOV-') && !afterText.includes('CPOV-')) {
                correctedText = correctedText.replace(originalNumber, correctedNumber);
                corrections.push(`${originalNumber} → ${correctedNumber}`);
                console.log(`🔧 Corrección aplicada: ${originalNumber} → ${correctedNumber}`);
            } else {
                console.log(`⚠️ Corrección omitida (cerca de número de orden): ${originalNumber}`);
            }
        }
    }
    
    // Detectar y corregir otros patrones problemáticos (más conservador)
    const otherProblematicPatterns = [
        { pattern: /1(\d{2})\s+UND/gi, description: 'números de 2 dígitos' }
        // Removido el patrón para números de 1 dígito para evitar sobrecorrecciones
    ];
    
    otherProblematicPatterns.forEach(({ pattern, description }) => {
        while ((match = pattern.exec(correctedText)) !== null) {
            const originalNumber = match[0];
            const correctedNumber = match[1] + ' UND';
            
            // Verificar que no sea un número de orden válido
            const orderPattern = new RegExp(`CPOV-${match[1]}`, 'i');
            if (!orderPattern.test(correctedText)) {
                // Verificación adicional: asegurar que no esté cerca de un número de orden
                const matchIndex = correctedText.indexOf(originalNumber);
                const beforeText = correctedText.substring(Math.max(0, matchIndex - 50), matchIndex);
                const afterText = correctedText.substring(matchIndex + originalNumber.length, matchIndex + originalNumber.length + 50);
                
                // Solo corregir si no hay contexto de número de orden cerca
                if (!beforeText.includes('CPOV-') && !afterText.includes('CPOV-')) {
                    correctedText = correctedText.replace(originalNumber, correctedNumber);
                    corrections.push(`${originalNumber} → ${correctedNumber}`);
                    console.log(`🔧 Corrección aplicada (${description}): ${originalNumber} → ${correctedNumber}`);
                } else {
                    console.log(`⚠️ Corrección omitida (cerca de número de orden): ${originalNumber}`);
                }
            }
        }
    });
    
    if (corrections.length > 0) {
        console.log(`🔧 Total de correcciones aplicadas: ${corrections.length}`);
        console.log('🔧 Lista de correcciones:', corrections);
    } else {
        console.log('✅ No se encontraron problemas específicos de Vercel para corregir');
    }
    
    console.log('📄 Texto después de correcciones (primeros 500 chars):', correctedText.substring(0, 500));
    
    return correctedText;
}

// Función de preprocesamiento de texto para mejorar extracción en Vercel
function preprocessText(text) {
    console.log('🔧 Preprocesando texto para Vercel...');
    console.log('📄 Longitud original:', text.length);
    console.log('📄 Texto original (primeros 500 chars):', text.substring(0, 500));
    
    // Normalizar solo saltos de línea (más conservador)
    let processedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    console.log('📄 Texto después de normalizar saltos de línea (primeros 500 chars):', processedText.substring(0, 500));
    
    // Separar por líneas y limpiar solo espacios al inicio/final
    const lines = processedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    console.log('📄 Número de líneas:', lines.length);
    
    // Log de muestra para debugging
    console.log('📄 Muestra del texto procesado (primeras 5 líneas):');
    lines.slice(0, 5).forEach((line, index) => {
        console.log(`${index + 1}: "${line}"`);
    });
    
    // Reconstruir el texto con líneas bien separadas (sin limpiar espacios internos)
    processedText = lines.join('\n');
    
    console.log('📄 Longitud procesada:', processedText.length);
    console.log('📄 Texto final (primeros 500 chars):', processedText.substring(0, 500));
    
    return processedText;
}

// Función de extracción con IA
async function extractWithAI(text, requestedFields) {
    try {
        console.log('🤖 Iniciando extracción con Gemini Flash...');
        console.log('📋 Campos solicitados:', requestedFields);
        console.log('📄 Longitud del texto:', text.length);

        // Preprocesar el texto para Vercel
        text = preprocessText(text);

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

        const prompt = `Extrae los siguientes campos del documento, procesando línea por línea para evitar mezclar campos de diferentes filas:

- ID de carga
- Número de orden  
- Nombre de artículo
- Cantidad

IMPORTANTE: 
- Procesa cada línea individualmente
- Para cantidades, busca solo números de 1-4 dígitos seguidos de "UND" o "UNIDADES"
- NO mezcles números de orden (CPOV-) con cantidades
- Solo incluye cantidades que estén claramente asociadas a artículos

Documento: ${text.substring(0, 15000)}

Responde SOLO con un JSON en este formato:
{"campos": [{"nombre": "campo", "valor": "valor"}]}`;

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
                    
                    // Validar y limpiar los datos extraídos
                    const validatedFields = parsedData.campos.filter(field => {
                        if (field.nombre && field.valor) {
                            // Validación específica para cantidades
                            if (field.nombre.toLowerCase().includes('cantidad')) {
                                const numValue = parseInt(field.valor);
                                if (isNaN(numValue) || numValue <= 0 || numValue > 9999) {
                                    console.log(`⚠️ Cantidad inválida descartada: ${field.valor}`);
                                    return false;
                                }
                            }
                            return true;
                        }
                        return false;
                    });
                    
                    console.log(`✅ ${validatedFields.length} campos válidos después de validación`);
                    return validatedFields;
                } else {
                    console.log('⚠️ Respuesta de Gemini no tiene el formato esperado');
                    return extractFieldsManually(text, requestedFields);
                }
            } else {
                console.log('⚠️ No se encontró JSON válido en la respuesta');
                return extractFieldsManually(text, requestedFields);
            }
        } catch (parseError) {
            console.log('⚠️ Error parseando JSON de Gemini:', parseError.message);
            return extractFieldsManually(text, requestedFields);
        }
    } catch (error) {
        console.error('❌ Error en extracción con IA:', error);
        return extractFieldsManually(text, requestedFields);
    }
}

// Función de extracción manual (fallback)
function extractFieldsManually(text, requestedFields) {
    console.log('🔍 Iniciando extracción manual mejorada...');
    console.log('📄 Longitud del texto a procesar:', text.length);
    console.log('📋 Campos solicitados:', requestedFields);
    
    const results = [];
    
    // Separar el texto por líneas y limpiar
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    console.log(`📄 Procesando ${lines.length} líneas del documento`);
    
    // Log de las primeras líneas para debugging
    console.log('📄 Primeras 5 líneas del documento:');
    lines.slice(0, 5).forEach((line, index) => {
        console.log(`${index + 1}: "${line}"`);
    });

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
            console.log('🔍 Procesando cantidades línea por línea...');
            
            // Procesar cada línea individualmente para cantidades
            lines.forEach((line, lineIndex) => {
                // Solo procesar líneas que contengan palabras clave relevantes
                if (line.includes('TUBOS PVC') || line.includes('UND') || line.includes('UNIDADES') || line.includes('CORVI') || line.includes('SONACA')) {
                    console.log(`📄 Procesando línea ${lineIndex + 1}: "${line}"`);
                    
                    // Patrón más específico para cantidades: \b(\d{1,4})\s*UND\b
                    const quantityPattern = /\b(\d{1,4})\s*UND\b/gi;
                    const matches = line.match(quantityPattern);
                    
                    if (matches) {
                        matches.forEach(match => {
                            // Extraer solo el número
                            const numberMatch = match.match(/(\d{1,4})/);
                            if (numberMatch) {
                                const quantity = numberMatch[1];
                                const numValue = parseInt(quantity);
                                
                                // Validación cruzada: descartar números sospechosos
                                if (numValue > 0 && numValue <= 9999) {
                                    // Verificar que no sea un número de orden (CPOV-)
                                    if (!line.includes('CPOV-') || !line.match(/CPOV-\d+/)) {
                                        results.push({ nombre: field, valor: quantity });
                                        console.log(`✅ Cantidad válida encontrada en línea ${lineIndex + 1}: ${quantity} UND`);
                                    } else {
                                        console.log(`⚠️ Cantidad descartada (posible número de orden): ${quantity} en línea ${lineIndex + 1}`);
                                    }
                                } else {
                                    console.log(`⚠️ Cantidad fuera de rango: ${quantity} en línea ${lineIndex + 1}`);
                                }
                            }
                        });
                    }
                    
                    // Buscar también cantidades sin "UND" pero con contexto de artículo
                    const numberOnlyPattern = /\b(\d{1,4})\b/gi;
                    const numberMatches = line.match(numberOnlyPattern);
                    
                    if (numberMatches && line.includes('TUBOS PVC')) {
                        numberMatches.forEach(match => {
                            const numValue = parseInt(match);
                            
                            // Validación más estricta para números sin "UND"
                            if (numValue > 0 && numValue <= 9999) {
                                // Verificar que no sea parte de un número de orden
                                const orderPattern = /CPOV-\d+/;
                                if (!orderPattern.test(line)) {
                                    // Verificar que esté cerca del nombre del artículo
                                    const articleIndex = line.indexOf('TUBOS PVC');
                                    const numberIndex = line.indexOf(match);
                                    
                                    // Si el número está después del artículo, es probablemente una cantidad
                                    if (articleIndex !== -1 && numberIndex > articleIndex) {
                                        results.push({ nombre: field, valor: match });
                                        console.log(`✅ Cantidad inferida en línea ${lineIndex + 1}: ${match}`);
                                    }
                                }
                            }
                        });
                    }
                }
            });
            
            // Si no se encontraron cantidades con el método específico, usar fallback
            if (results.filter(r => r.nombre === field).length === 0) {
                console.log('🔄 Usando método de fallback para cantidades...');
                
                const quantityPatterns = [
                    /\b(\d{1,4})\s+UND\b/gi,
                    /\b(\d{1,4})\s+UNIDADES\b/gi,
                    /\b(\d{1,4})\s+PCS\b/gi,
                    /(?:Cantidad|Quantity):\s*(\d{1,4})/gi
                ];
                
                quantityPatterns.forEach(pattern => {
                    const matches = text.match(pattern);
                    if (matches) {
                        matches.forEach(match => {
                            const numberMatch = match.match(/(\d{1,4})/);
                            if (numberMatch) {
                                const quantity = numberMatch[1];
                                const numValue = parseInt(quantity);
                                
                                if (numValue > 0 && numValue <= 9999) {
                                    results.push({ nombre: field, valor: quantity });
                                    console.log(`✅ Cantidad de fallback: ${quantity}`);
                                }
                            }
                        });
                    }
                });
            }
        }
    });

    console.log(`📊 Total de campos encontrados manualmente: ${results.length}`);
    console.log('📋 Resultados finales de extracción manual:', results);
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

    console.log('📊 Datos agrupados:', groupedData);

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

    console.log('📊 Datos extraídos:');
    console.log('- ID de carga:', loadId);
    console.log('- Números de orden:', uniqueOrders);
    console.log('- Nombres de artículos:', articleNames);
    console.log('- Cantidades:', quantities);

    // Crear registros usando método mejorado
    const records = [];
    
    // Método 1: Procesar datos secuencialmente para mantener relaciones
    if (structuredData && structuredData.length > 0) {
        console.log('🔄 Usando método secuencial mejorado para crear registros...');
        
        // Crear un mapa para mantener las relaciones
        const orderArticleMap = new Map();
        let currentOrder = '';
        let currentArticle = '';
        
        // Primera pasada: identificar relaciones orden-artículo
        for (let i = 0; i < structuredData.length; i++) {
            const item = structuredData[i];
            const label = item.label || item.nombre || '';
            const value = item.value || item.valor || '';
            
            if (label.toLowerCase().includes('número de orden') || label.toLowerCase().includes('numero de orden') || label.toLowerCase().includes('order number')) {
                currentOrder = value;
                console.log(`📋 Encontrado orden: ${currentOrder}`);
            } else if (label.toLowerCase().includes('nombre de artículo') || label.toLowerCase().includes('nombre de articulo') || label.toLowerCase().includes('article name')) {
                currentArticle = value;
                console.log(`📋 Encontrado artículo: ${currentArticle}`);
                
                // Guardar la relación orden-artículo
                if (currentOrder && currentArticle) {
                    orderArticleMap.set(currentOrder, currentArticle);
                    console.log(`📋 Relación guardada: ${currentOrder} → ${currentArticle}`);
                }
            }
        }
        
        console.log('📋 Mapa de relaciones orden-artículo:', orderArticleMap);
        
        // Segunda pasada: asignar cantidades a las relaciones correctas
        let quantityIndex = 0;
        const processedOrders = new Set();
        
        for (const order of uniqueOrders) {
            const article = orderArticleMap.get(order);
            
            if (article) {
                // Buscar cantidades que correspondan a este orden
                // Por ahora, asignar cantidades secuencialmente
                const orderQuantities = [];
                
                // Asignar al menos una cantidad por orden
                if (quantityIndex < quantities.length) {
                    orderQuantities.push(quantities[quantityIndex]);
                    quantityIndex++;
                }
                
                // Si hay más cantidades y este orden aparece múltiples veces, asignar más
                const orderCount = orderNumbers.filter(o => o === order).length;
                for (let i = 1; i < orderCount && quantityIndex < quantities.length; i++) {
                    orderQuantities.push(quantities[quantityIndex]);
                    quantityIndex++;
                }
                
                // Crear registros para este orden
                if (orderQuantities.length > 0) {
                    for (const quantity of orderQuantities) {
                        records.push({
                            loadId: loadId,
                            orderNumber: order,
                            articleName: article,
                            quantity: quantity
                        });
                        console.log(`📝 Registro creado: ${order} | ${article} | ${quantity}`);
                    }
                } else {
                    // Si no hay cantidades, crear registro vacío
                    records.push({
                        loadId: loadId,
                        orderNumber: order,
                        articleName: article,
                        quantity: ''
                    });
                    console.log(`📝 Registro vacío creado: ${order} | ${article} | (sin cantidad)`);
                }
                
                processedOrders.add(order);
            }
        }
        
        // Si no se procesaron todos los órdenes, usar método de fallback
        if (records.length === 0) {
            console.log('🔄 Usando método de fallback para crear registros...');
            
            // Crear combinaciones de orden + artículo + cantidad
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
    }

    console.log('📊 Registros creados:', records.length);
    records.forEach((record, index) => {
        console.log(`${index + 1}. ${record.orderNumber} | ${record.articleName} | ${record.quantity}`);
    });

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
                let extractedText = '';
                const file = files[0];
                
                if (file.mimetype === 'application/pdf') {
                    // Para PDF, usar extracción mejorada específica para Vercel
                    try {
                        console.log('📄 Procesando archivo PDF en Vercel...');
                        
                        // INTENTAR PRIMERO CON pdfjs-dist (método preferido)
                        console.log('🔄 Intentando extracción con pdfjs-dist...');
                        let extractedTextFromPdfJS = await extractPDFWithPdfJS(file.buffer);
                        
                        if (extractedTextFromPdfJS && extractedTextFromPdfJS.length > 100) {
                            console.log('✅ Usando extracción de pdfjs-dist');
                            extractedText = extractedTextFromPdfJS;
                        } else {
                            console.log('⚠️ pdfjs-dist falló, usando pdf-parse como fallback');
                            
                            // Fallback a pdf-parse
                            const pdfParse = require('pdf-parse');
                            
                            // Opciones específicas para Vercel (mejoradas para preservar estructura)
                            const options = {
                                normalizeWhitespace: false, // Cambiado a false para preservar espacios
                                disableCombineTextItems: true, // Cambiado a true para mantener estructura
                                preserveWhitespace: true,
                                max: 0, // Sin límite de páginas
                                version: 'v2.0.550'
                            };
                            
                            const pdfData = await pdfParse(file.buffer, options);
                            extractedText = pdfData.text;
                        }
                        
                        console.log(`📄 Texto extraído del PDF: ${extractedText.length} caracteres`);
                        console.log(`📄 Número de páginas detectadas: ${pdfData?.numpages || 'Desconocido'}`);
                        
                        // Log de una muestra del texto para debugging
                        const sampleText = extractedText.substring(0, 1000);
                        console.log('📄 Muestra del texto extraído (primeros 1000 chars):', sampleText);
                        
                        // Limpieza específica para Vercel (más conservadora)
                        console.log('🔧 Aplicando limpieza específica para Vercel...');
                        console.log('📄 Texto original (primeros 500 chars):', extractedText.substring(0, 500));
                        
                        // LIMPIEZA MÍNIMA: Solo normalizar saltos de línea básicos
                        console.log('📄 Aplicando limpieza mínima...');
                        
                        // Solo normalizar saltos de línea (sin tocar espacios)
                        const originalText = extractedText;
                        extractedText = extractedText
                            .replace(/\r\n/g, '\n')
                            .replace(/\r/g, '\n');
                        
                        console.log('📄 Texto después de normalizar saltos de línea (primeros 500 chars):', extractedText.substring(0, 500));
                        
                        // Verificar si hubo cambios significativos
                        if (originalText !== extractedText) {
                            console.log('⚠️ Se aplicaron cambios en saltos de línea');
                        } else {
                            console.log('✅ No se aplicaron cambios en saltos de línea');
                        }
                        
                        // NO APLICAR LIMPIEZA ADICIONAL - preservar estructura original
                        console.log('📄 Preservando estructura original del texto');
                        console.log(`📄 Longitud final: ${extractedText.length} caracteres`);
                        console.log('📄 Texto final (primeros 500 chars):', extractedText.substring(0, 500));
                        
                        // Buscar cantidades específicas en el texto para verificar
                        const quantityMatches = extractedText.match(/\b(\d{1,4})\s*UND\b/gi);
                        console.log('🔍 Cantidades encontradas en el texto:', quantityMatches);
                        
                        // Buscar patrones problemáticos que puedan estar causando el "1" extra
                        const problematicPatterns = extractedText.match(/(?:1\s*)?(\d+)\s+UND/gi);
                        console.log('⚠️ Patrones problemáticos encontrados:', problematicPatterns);
                        
                        // Buscar números que empiecen con 1 seguidos de otros números
                        const onePattern = extractedText.match(/1(\d+)\s+UND/gi);
                        console.log('🔍 Números que empiezan con 1:', onePattern);
                        
                        // Buscar la sección problemática específicamente
                        const beforeSection = extractedText.substring(0, extractedText.indexOf('CPOV-000009911'));
                        const afterSection = extractedText.substring(extractedText.indexOf('CPOV-000009911'));
                        
                        console.log('📄 Sección ANTES de CPOV-000009911 (primeros 500 chars):', beforeSection.substring(0, 500));
                        console.log('📄 Sección DESPUÉS de CPOV-000009911 (primeros 500 chars):', afterSection.substring(0, 500));
                        
                        // Buscar cantidades en cada sección
                        const beforeQuantities = beforeSection.match(/\b(\d{1,4})\s*UND\b/gi);
                        const afterQuantities = afterSection.match(/\b(\d{1,4})\s*UND\b/gi);
                        
                        console.log('🔍 Cantidades ANTES de CPOV-000009911:', beforeQuantities);
                        console.log('🔍 Cantidades DESPUÉS de CPOV-000009911:', afterQuantities);
                        
                        if (extractedText.length < 100) {
                            console.warn('⚠️ Texto extraído muy corto, puede haber problemas con el PDF');
                        }
                        
                        // Aplicar preprocesamiento adicional específico para Vercel
                        console.log('🔄 ANTES de preprocessText:');
                        console.log('📄 Longitud:', extractedText.length);
                        console.log('📄 Muestra:', extractedText.substring(0, 300));
                        
                        // TEMPORALMENTE DESACTIVADO: preprocessText(extractedText);
                        console.log('⚠️ preprocessText() DESACTIVADO temporalmente');
                        
                        console.log('🔄 DESPUÉS de preprocessText (sin cambios):');
                        console.log('📄 Longitud:', extractedText.length);
                        console.log('📄 Muestra:', extractedText.substring(0, 300));
                        
                        // Aplicar correcciones específicas para problemas de Vercel
                        console.log('🔄 ANTES de fixVercelSpecificIssues:');
                        console.log('📄 Longitud:', extractedText.length);
                        console.log('📄 Muestra:', extractedText.substring(0, 300));
                        
                        // TEMPORALMENTE DESACTIVADO: fixVercelSpecificIssues(extractedText);
                        console.log('⚠️ fixVercelSpecificIssues() DESACTIVADO temporalmente');
                        
                        console.log('🔄 DESPUÉS de fixVercelSpecificIssues (sin cambios):');
                        console.log('📄 Longitud:', extractedText.length);
                        console.log('📄 Muestra:', extractedText.substring(0, 300));
                        
                    } catch (pdfError) {
                        console.error('❌ Error extrayendo PDF:', pdfError.message);
                        extractedText = 'PDF procesado - contenido no extraíble';
                    }
                } else {
                    extractedText = file.buffer.toString('utf8');
                    // Preprocesar también texto plano
                    extractedText = preprocessText(extractedText);
                }

                        // Extraer datos con IA mejorada
        console.log('🔍 Iniciando extracción con IA mejorada...');
        const extractedData = await extractWithAI(extractedText, requestedFields);
        console.log('📊 Datos extraídos con IA:', extractedData.length, 'campos');

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
                console.log('📊 Generando archivo Excel...');
                const excelBuffer = generateExcel(extractedData);

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
