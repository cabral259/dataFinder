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
    
    // Método 1: Procesar datos secuencialmente para mantener relaciones exactas
    if (structuredData && structuredData.length > 0) {
        console.log('🔄 Usando método secuencial para mantener relaciones exactas...');
        
        // Crear un mapa para mantener las relaciones orden-artículo-cantidad
        const orderArticleQuantityMap = new Map();
        let currentOrder = '';
        let currentArticle = '';
        let currentQuantities = [];
        
        // Primera pasada: identificar relaciones orden-artículo-cantidad
        for (let i = 0; i < structuredData.length; i++) {
            const item = structuredData[i];
            const label = item.label || item.nombre || '';
            const value = item.value || item.valor || '';
            
            if (label.toLowerCase().includes('número de orden') || label.toLowerCase().includes('numero de orden') || label.toLowerCase().includes('order number')) {
                // Si tenemos datos acumulados, guardar la relación
                if (currentOrder && currentArticle) {
                    const key = `${currentOrder}|${currentArticle}`;
                    orderArticleQuantityMap.set(key, currentQuantities);
                    console.log(`📋 Relación guardada: ${currentOrder} | ${currentArticle} | Cantidades: [${currentQuantities.join(', ')}]`);
                }
                
                // Iniciar nuevo registro
                currentOrder = value;
                currentArticle = '';
                currentQuantities = [];
                console.log(`📋 Nuevo orden: ${currentOrder}`);
                
            } else if (label.toLowerCase().includes('nombre de artículo') || label.toLowerCase().includes('nombre de articulo') || label.toLowerCase().includes('article name')) {
                currentArticle = value;
                console.log(`📋 Artículo: ${currentArticle}`);
                
            } else if (label.toLowerCase().includes('cantidad')) {
                currentQuantities.push(value);
                console.log(`📋 Cantidad agregada: ${value} para orden: ${currentOrder}`);
            }
        }
        
        // Guardar el último registro
        if (currentOrder && currentArticle) {
            const key = `${currentOrder}|${currentArticle}`;
            orderArticleQuantityMap.set(key, currentQuantities);
            console.log(`📋 Última relación guardada: ${currentOrder} | ${currentArticle} | Cantidades: [${currentQuantities.join(', ')}]`);
        }
        
        console.log('📋 Mapa completo de relaciones:', orderArticleQuantityMap);
        
        // Segunda pasada: crear registros con las relaciones exactas
        for (const [key, quantities] of orderArticleQuantityMap) {
            const [order, article] = key.split('|');
            
            if (quantities.length > 0) {
                // Crear un registro por cada cantidad
                for (const quantity of quantities) {
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
        }
        
        // Si no se crearon registros, usar método de fallback
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
                    // USAR EXACTAMENTE LA MISMA LÓGICA QUE LOCAL
                    try {
                        console.log('📄 Procesando archivo PDF usando lógica LOCAL...');
                        
                        // Importar la clase ExtractorDatos del servidor local
                        const ExtractorDatos = require('../index');
                        const extractor = new ExtractorDatos();
                        
                        // Crear un archivo temporal para usar la lógica local
                        const tempFilePath = `/tmp/${Date.now()}-${file.originalname}`;
                        require('fs').writeFileSync(tempFilePath, file.buffer);
                        
                        console.log('📄 Archivo temporal creado:', tempFilePath);
                        
                        // Usar exactamente la misma lógica que local
                        const textResult = await extractor.extractFromMultipleFiles([tempFilePath], {
                            extractionType: 'all'
                        });
                        
                        console.log('📄 Resultado de extracción local:', textResult);
                        
                        if (!textResult || textResult.length === 0) {
                            throw new Error('No se pudo extraer texto del documento');
                        }
                        
                        // Obtener el texto del resultado (misma lógica que local)
                        const firstResult = textResult[0];
                        let fullText = '';
                        
                        if (firstResult.success && firstResult.data) {
                            // Para PDF, Word, Text
                            if (firstResult.data.text) {
                                fullText = firstResult.data.text;
                            }
                            // Para Excel, convertir a texto
                            else if (firstResult.data.sheets) {
                                fullText = firstResult.data.sheets.map(sheet => 
                                    sheet.data.map(row => row.join(' ')).join('\n')
                                ).join('\n');
                            }
                        }
                        
                        extractedText = fullText;
                        
                        console.log('📄 Texto extraído usando lógica LOCAL:');
                        console.log('📄 Longitud:', extractedText.length);
                        console.log('📄 Muestra (primeros 1000 chars):', extractedText.substring(0, 1000));
                        
                        // Limpiar archivo temporal
                        if (require('fs').existsSync(tempFilePath)) {
                            require('fs').unlinkSync(tempFilePath);
                        }
                        
                    } catch (pdfError) {
                        console.error('❌ Error usando lógica local:', pdfError.message);
                        
                        // Fallback a método anterior si falla
                        console.log('🔄 Usando fallback a pdf-parse...');
                        const pdfParse = require('pdf-parse');
                        const pdfData = await pdfParse(file.buffer);
                        extractedText = pdfData.text;
                    }
                } else {
                    // Para otros tipos de archivo, usar la misma lógica local
                    try {
                        console.log('📄 Procesando archivo no-PDF usando lógica LOCAL...');
                        
                        const ExtractorDatos = require('../index');
                        const extractor = new ExtractorDatos();
                        
                        const tempFilePath = `/tmp/${Date.now()}-${file.originalname}`;
                        require('fs').writeFileSync(tempFilePath, file.buffer);
                        
                        const textResult = await extractor.extractFromMultipleFiles([tempFilePath], {
                            extractionType: 'all'
                        });
                        
                        if (textResult && textResult.length > 0) {
                            const firstResult = textResult[0];
                            if (firstResult.success && firstResult.data && firstResult.data.text) {
                                extractedText = firstResult.data.text;
                            } else {
                                extractedText = file.buffer.toString('utf8');
                            }
                        } else {
                            extractedText = file.buffer.toString('utf8');
                        }
                        
                        // Limpiar archivo temporal
                        if (require('fs').existsSync(tempFilePath)) {
                            require('fs').unlinkSync(tempFilePath);
                        }
                        
                    } catch (error) {
                        console.error('❌ Error procesando archivo:', error.message);
                        extractedText = file.buffer.toString('utf8');
                    }
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
