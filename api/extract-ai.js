const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const XLSX = require('xlsx');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

// Configuración de multer para Vercel
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    }
});

// Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Función mejorada para extraer texto de PDF usando pdfjs-dist
async function extractTextFromPDF(buffer) {
    try {
        console.log('📄 Iniciando extracción con pdfjs-dist...');
        
        // Configurar el worker de pdfjs-dist para Vercel
        const pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
        
        // Cargar el PDF
        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(buffer),
            disableFontFace: false,
            standardFontDataUrl: null
        });
        
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        
        console.log(`📄 PDF cargado: ${numPages} páginas detectadas`);
        
        // Limitar a 20 páginas para evitar timeouts en Vercel
        const maxPages = Math.min(numPages, 20);
        console.log(`📄 Procesando ${maxPages} páginas (limitado para Vercel)`);
        
        let extractedText = '';
        
        // Procesar páginas secuencialmente para mejor control
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
            try {
                console.log(`📄 Procesando página ${pageNum}/${maxPages}...`);
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // Concatenar el texto de la página con mejor preservación de estructura
                let pageText = '';
                
                // Método mejorado para preservar líneas
                const textItems = textContent.items.map(item => ({
                    text: item.str || '',
                    x: item.transform[4],
                    y: item.transform[5],
                    width: item.width || 0
                }));
                
                // Agrupar por posición Y (líneas)
                const lineGroups = {};
                textItems.forEach(item => {
                    const yKey = Math.round(item.y * 100) / 100; // Redondear para agrupar líneas similares
                    if (!lineGroups[yKey]) {
                        lineGroups[yKey] = [];
                    }
                    lineGroups[yKey].push(item);
                });
                
                // Ordenar líneas por posición Y (de arriba a abajo)
                const sortedYKeys = Object.keys(lineGroups).sort((a, b) => parseFloat(b) - parseFloat(a));
                
                // Construir líneas ordenadas por posición X dentro de cada línea
                const lines = [];
                sortedYKeys.forEach(yKey => {
                    const lineItems = lineGroups[yKey].sort((a, b) => a.x - b.x);
                    const lineText = lineItems.map(item => item.text).join(' ').trim();
                    
                    if (lineText.length > 0) {
                        lines.push(lineText);
                    }
                });
                
                pageText = lines.join('\n');
                extractedText += pageText + '\n';
                
                // Log de progreso cada 5 páginas
                if (pageNum % 5 === 0) {
                    console.log(`📄 Progreso: ${pageNum}/${maxPages} páginas procesadas`);
                }
                
            } catch (pageError) {
                console.log(`⚠️ Error en página ${pageNum}: ${pageError.message}`);
                continue;
            }
        }
        
        console.log(`📄 Extracción completada: ${extractedText.length} caracteres`);
        return extractedText;
        
    } catch (error) {
        console.error('❌ Error con pdfjs-dist:', error.message);
        
        // Fallback a pdf-parse si pdfjs-dist falla
        try {
            console.log('🔄 Intentando fallback con pdf-parse...');
            const pdfParse = require('pdf-parse');
            const pdfData = await pdfParse(buffer);
            console.log(`📄 Fallback exitoso: ${pdfData.text.length} caracteres`);
            return pdfData.text;
        } catch (fallbackError) {
            console.error('❌ Error en fallback:', fallbackError.message);
            throw new Error('No se pudo extraer texto del PDF');
        }
    }
}

// Función mejorada para validar cantidades
function validateQuantity(quantity, context = '') {
    try {
        // Limpiar la cantidad
        const cleanQuantity = quantity.toString().trim();
        
        // Extraer solo números
        const numericMatch = cleanQuantity.match(/(\d+)/);
        if (!numericMatch) {
            console.log(`⚠️ Cantidad inválida (sin números): "${quantity}"`);
            return null;
        }
        
        const numericValue = parseInt(numericMatch[1]);
        
        // Validaciones
        if (numericValue <= 0) {
            console.log(`⚠️ Cantidad inválida (≤ 0): "${quantity}"`);
            return null;
        }
        
        if (numericValue > 99999) {
            console.log(`⚠️ Cantidad sospechosa (muy alta): "${quantity}"`);
            return null;
        }
        
        // Verificar contexto si está disponible
        if (context) {
            const contextLower = context.toLowerCase();
            
            // Si el contexto sugiere que es una cantidad válida
            if (contextLower.includes('und') || 
                contextLower.includes('unidades') || 
                contextLower.includes('pcs') || 
                contextLower.includes('piezas') ||
                contextLower.includes('cantidad')) {
                console.log(`✅ Cantidad validada con contexto: "${quantity}" -> ${numericValue}`);
                return numericValue.toString();
            }
        }
        
        // Si no hay contexto, ser más estricto
        if (numericValue >= 1 && numericValue <= 9999) {
            console.log(`✅ Cantidad validada: "${quantity}" -> ${numericValue}`);
            return numericValue.toString();
        }
        
        console.log(`⚠️ Cantidad fuera de rango razonable: "${quantity}"`);
        return null;
        
    } catch (error) {
        console.log(`❌ Error validando cantidad "${quantity}":`, error.message);
        return null;
    }
}

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

        // Función para reconstruir líneas si el texto está fusionado
        function reconstructLines(text) {
            const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
            
            // Si hay pocas líneas, intentar reconstruir basándose en patrones
            if (lines.length < 5) {
                console.log('⚠️ Pocas líneas detectadas, intentando reconstruir...');
                
                // Buscar patrones de inicio de línea
                const lineStartPattern = /(CG-\d+)/g;
                const matches = [...text.matchAll(lineStartPattern)];
                
                if (matches.length > 0) {
                    const reconstructedLines = [];
                    for (let i = 0; i < matches.length; i++) {
                        const startIndex = matches[i].index;
                        const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
                        const line = text.substring(startIndex, endIndex).trim();
                        
                        if (line.length > 10) {
                            reconstructedLines.push(line);
                        }
                    }
                    
                    if (reconstructedLines.length > 0) {
                        console.log(`✅ Reconstruidas ${reconstructedLines.length} líneas`);
                        return reconstructedLines;
                    }
                }
            }
            
            return lines;
        }
        
        // Procesar el texto línea por línea antes de enviarlo a Gemini
        const lines = reconstructLines(text);
        console.log(`📄 Procesando ${lines.length} líneas para Gemini`);
        
        // Filtrar solo líneas relevantes que contengan información de artículos
        const relevantLines = lines.filter(line => 
            line.includes('TUBOS PVC') || 
            line.includes('CORVI-SONACA') || 
            line.includes('CPOV-') || 
            line.includes('CG-')
        );
        
        console.log(`📄 Líneas relevantes encontradas: ${relevantLines.length}`);
        
        // Log de las líneas relevantes para debugging
        console.log('📄 Líneas relevantes:');
        relevantLines.forEach((line, index) => {
            console.log(`${index + 1}. ${line}`);
        });
        
        // Crear un prompt más específico con instrucciones claras
        const prompt = `Extrae los siguientes campos del documento, procesando CADA LÍNEA POR SEPARADO:

- ID de carga (formato: CG-XXXXXXX)
- Número de orden (formato: CPOV-XXXXXXXXX)
- Nombre de artículo (debe contener "TUBOS PVC" y "CORVI-SONACA")
- Cantidad (solo números que estén en la MISMA LÍNEA que el artículo, seguidos de "UND")

IMPORTANTE:
1. Procesa cada línea individualmente
2. La cantidad debe estar en la MISMA LÍNEA que el nombre del artículo
3. NO mezcles cantidades de líneas diferentes
4. Solo considera cantidades que estén claramente asociadas al artículo en esa línea específica
5. Si una línea no tiene cantidad clara, omítela

Documento (cada línea separada):
${relevantLines.map((line, index) => `Línea ${index + 1}: ${line}`).join('\n')}

Responde SOLO con un JSON en este formato:
{"campos": [{"nombre": "campo", "valor": "valor", "linea": numero_linea}]}`;

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
                    
                    // Validar y limpiar los campos extraídos
                    const validatedFields = [];
                    const seenCombinations = new Set();
                    
                    parsedData.campos.forEach(field => {
                        const fieldName = field.nombre || field.label || '';
                        const fieldValue = field.valor || field.value || '';
                        const lineNumber = field.linea || field.line || 0;
                        
                        // Validar que el campo tenga valor
                        if (!fieldValue || fieldValue.trim() === '') {
                            console.log(`⚠️ Campo vacío ignorado: ${fieldName}`);
                            return;
                        }
                        
                        // Para cantidades, aplicar validaciones adicionales
                        if (fieldName.toLowerCase().includes('cantidad')) {
                            const numericMatch = fieldValue.match(/(\d+)/);
                            if (!numericMatch) {
                                console.log(`⚠️ Cantidad inválida ignorada: ${fieldValue}`);
                                return;
                            }
                            
                            const numericValue = parseInt(numericMatch[1]);
                            
                            // Validar que la cantidad sea razonable
                            if (numericValue <= 0 || numericValue > 99999) {
                                console.log(`⚠️ Cantidad fuera de rango ignorada: ${fieldValue}`);
                                return;
                            }
                            
                            // Verificar que no sea parte de un número de orden
                            if (numericValue > 500) {
                                const originalLine = relevantLines[lineNumber - 1] || '';
                                if (originalLine.includes('CPOV-')) {
                                    const orderMatch = originalLine.match(/CPOV-(\d+)/);
                                    if (orderMatch && orderMatch[1].includes(numericValue.toString())) {
                                        console.log(`⚠️ Cantidad parece ser número de orden ignorada: ${fieldValue}`);
                                        return;
                                    }
                                }
                            }
                        }
                        
                        // Evitar duplicados basándose en nombre y valor
                        const combination = `${fieldName}:${fieldValue}`;
                        if (seenCombinations.has(combination)) {
                            console.log(`⚠️ Campo duplicado ignorado: ${fieldName} = ${fieldValue}`);
                            return;
                        }
                        seenCombinations.add(combination);
                        
                        validatedFields.push({
                            nombre: fieldName,
                            valor: fieldValue,
                            linea: lineNumber
                        });
                        
                        console.log(`✅ Campo validado: ${fieldName} = ${fieldValue} (línea ${lineNumber})`);
                    });
                    
                    console.log(`📊 Total de campos validados: ${validatedFields.length}`);
                    return validatedFields;
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
    console.log('📄 Longitud del texto a procesar:', text.length);
    console.log('📋 Campos solicitados:', requestedFields);
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
            console.log('🔍 Iniciando búsqueda de cantidades con procesamiento línea por línea...');
            
            // Procesar el texto línea por línea para evitar fusiones
            const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
            console.log(`📄 Procesando ${lines.length} líneas del documento`);
            
            const foundQuantities = new Set(); // Evitar duplicados
            const quantityResults = [];
            
            // Patrón específico para cantidades con word boundaries
            const quantityPattern = /\b(\d{1,4})\s*UND\b/gi;
            
            lines.forEach((line, lineIndex) => {
                // Solo procesar líneas que contengan "TUBOS PVC" para asegurar contexto correcto
                if (line.includes('TUBOS PVC') || line.includes('CORVI-SONACA')) {
                    console.log(`🔍 Procesando línea ${lineIndex + 1}: "${line.trim()}"`);
                    
                    // Buscar cantidades en esta línea específica
                    const matches = line.match(quantityPattern);
                    if (matches) {
                        console.log(`✅ Línea ${lineIndex + 1} - Cantidades encontradas:`, matches);
                        
                        matches.forEach(match => {
                            // Extraer solo el número del match
                            const numericMatch = match.match(/(\d+)/);
                            if (numericMatch) {
                                const quantity = numericMatch[1];
                                const numericValue = parseInt(quantity);
                                
                                // Validación cruzada para evitar confundir número de orden con cantidad
                                if (numericValue > 500) {
                                    // Verificar que no sea un número de orden (CPOV-)
                                    if (line.includes('CPOV-')) {
                                        const orderMatch = line.match(/CPOV-(\d+)/);
                                        if (orderMatch && orderMatch[1].includes(quantity)) {
                                            console.log(`⚠️ Cantidad rechazada (parece ser número de orden): "${quantity}" en línea ${lineIndex + 1}`);
                                            return;
                                        }
                                    }
                                    
                                    // Verificar que esté claramente junto al nombre del artículo
                                    const articleContext = line.includes('CORVI-SONACA') || line.includes('TUBOS PVC');
                                    if (!articleContext) {
                                        console.log(`⚠️ Cantidad rechazada (sin contexto de artículo): "${quantity}" en línea ${lineIndex + 1}`);
                                        return;
                                    }
                                }
                                
                                // Validación adicional: verificar que no esté en el contexto de un número de orden
                                const beforeQuantity = line.substring(0, line.indexOf(match));
                                const afterQuantity = line.substring(line.indexOf(match) + match.length);
                                
                                // Si hay un CPOV- cerca, verificar que no sea parte del número de orden
                                if (beforeQuantity.includes('CPOV-')) {
                                    const orderInBefore = beforeQuantity.match(/CPOV-(\d+)/);
                                    if (orderInBefore && orderInBefore[1].endsWith(quantity)) {
                                        console.log(`⚠️ Cantidad rechazada (parte de número de orden): "${quantity}" en línea ${lineIndex + 1}`);
                                        return;
                                    }
                                }
                                
                                // Validar la cantidad con contexto completo de la línea
                                const validatedQuantity = validateQuantity(quantity, line);
                                
                                if (validatedQuantity && !foundQuantities.has(validatedQuantity)) {
                                    foundQuantities.add(validatedQuantity);
                                    quantityResults.push({ 
                                        nombre: field, 
                                        valor: validatedQuantity,
                                        context: line.trim(),
                                        lineNumber: lineIndex + 1
                                    });
                                    console.log(`✅ Cantidad agregada: "${validatedQuantity}" (línea ${lineIndex + 1})`);
                                    console.log(`📄 Contexto completo: "${line.trim()}"`);
                                } else if (!validatedQuantity) {
                                    console.log(`⚠️ Cantidad rechazada por validación: "${quantity}" en línea ${lineIndex + 1}`);
                                } else {
                                    console.log(`⚠️ Cantidad duplicada: "${quantity}" en línea ${lineIndex + 1}`);
                                }
                            }
                        });
                    } else {
                        console.log(`❌ Línea ${lineIndex + 1} - No se encontraron cantidades`);
                    }
                } else {
                    console.log(`⏭️ Línea ${lineIndex + 1} - Saltada (sin contexto de TUBOS PVC)`);
                }
            });
            
            // Agregar las cantidades válidas a los resultados
            results.push(...quantityResults);
            
            // Log final de cantidades encontradas
            console.log(`📊 Total de cantidades únicas encontradas: ${foundQuantities.size}`);
            console.log(`📋 Cantidades:`, Array.from(foundQuantities).sort((a, b) => parseInt(a) - parseInt(b)));
            
            // Log detallado de cada cantidad encontrada
            console.log('📋 Detalles de cantidades encontradas:');
            quantityResults.forEach((result, index) => {
                console.log(`${index + 1}. Cantidad: "${result.valor}" (línea ${result.lineNumber})`);
                console.log(`   Contexto: "${result.context}"`);
            });
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
                    // Para PDF, usar extracción mejorada con pdfjs-dist
                    try {
                        console.log('📄 Procesando archivo PDF con pdfjs-dist...');
                        console.log(`📄 Tamaño del archivo: ${file.size} bytes`);
                        
                        extractedText = await extractTextFromPDF(file.buffer);
                        
                        console.log(`📄 Texto extraído del PDF: ${extractedText.length} caracteres`);
                        
                        // Log detallado del texto extraído para debugging
                        const sampleText = extractedText.substring(0, 2000);
                        console.log('📄 Muestra del texto extraído (primeros 2000 chars):');
                        console.log('='.repeat(80));
                        console.log(sampleText);
                        console.log('='.repeat(80));
                        
                        // Análisis específico de cantidades en el texto extraído
                        console.log('🔍 Análisis detallado de cantidades en el texto:');
                        
                        // Buscar patrones específicos de cantidades
                        const undPattern = extractedText.match(/(\d+)\s+UND/gi);
                        const unidadesPattern = extractedText.match(/(\d+)\s+UNIDADES/gi);
                        const pcsPattern = extractedText.match(/(\d+)\s+PCS/gi);
                        const piezasPattern = extractedText.match(/(\d+)\s+PIEZAS/gi);
                        
                        console.log('🔍 Cantidades con UND:', undPattern);
                        console.log('🔍 Cantidades con UNIDADES:', unidadesPattern);
                        console.log('🔍 Cantidades con PCS:', pcsPattern);
                        console.log('🔍 Cantidades con PIEZAS:', piezasPattern);
                        
                        // Buscar números de orden para contexto
                        const orderNumbers = extractedText.match(/CPOV-\d+/gi);
                        console.log('🔍 Números de orden encontrados:', orderNumbers);
                        
                        // Buscar IDs de carga
                        const loadIds = extractedText.match(/CG-\d+/gi);
                        console.log('🔍 IDs de carga encontrados:', loadIds);
                        
                        // Análisis de secciones específicas si existen
                        if (extractedText.includes('CPOV-000009911')) {
                            console.log('🔍 Análisis de sección problemática CPOV-000009911:');
                            const beforeSection = extractedText.substring(0, extractedText.indexOf('CPOV-000009911'));
                            const afterSection = extractedText.substring(extractedText.indexOf('CPOV-000009911'));
                            
                            console.log('📄 Sección ANTES de CPOV-000009911 (últimos 500 chars):', beforeSection.substring(Math.max(0, beforeSection.length - 500)));
                            console.log('📄 Sección DESPUÉS de CPOV-000009911 (primeros 500 chars):', afterSection.substring(0, 500));
                            
                            // Buscar cantidades en cada sección
                            const beforeQuantities = beforeSection.match(/(\d+)\s+UND/gi);
                            const afterQuantities = afterSection.match(/(\d+)\s+UND/gi);
                            
                            console.log('🔍 Cantidades ANTES de CPOV-000009911:', beforeQuantities);
                            console.log('🔍 Cantidades DESPUÉS de CPOV-000009911:', afterQuantities);
                        }
                        
                        if (extractedText.length < 100) {
                            console.warn('⚠️ Texto extraído muy corto, puede haber problemas con el PDF');
                        }
                        
                        // Verificar calidad del texto extraído
                        const hasRelevantContent = extractedText.includes('CPOV') || extractedText.includes('CG-') || extractedText.includes('UND');
                        if (!hasRelevantContent) {
                            console.warn('⚠️ El texto extraído no contiene contenido relevante esperado');
                        }
                        
                    } catch (pdfError) {
                        console.error('❌ Error extrayendo PDF:', pdfError.message);
                        console.error('❌ Stack trace:', pdfError.stack);
                        extractedText = 'PDF procesado - contenido no extraíble';
                    }
                } else {
                    console.log('📄 Procesando archivo de texto...');
                    extractedText = file.buffer.toString('utf8');
                    console.log(`📄 Texto extraído: ${extractedText.length} caracteres`);
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
