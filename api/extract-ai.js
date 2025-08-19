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

// Función para generar Excel - COPIADA DEL SERVIDOR LOCAL
function generateExcel(structuredData) {
    console.log('📊 Generando Excel con', structuredData.length, 'campos extraídos...');
    const workbook = XLSX.utils.book_new();
    
    // Agrupar datos por categoría y eliminar duplicados
    const groupedData = {};
    if (structuredData && structuredData.length > 0) {
        structuredData.forEach(item => {
            // Verificar si el item tiene la estructura correcta
            const label = item.label || item.nombre || '';
            const value = item.value || item.valor || '';
            
            if (!groupedData[label]) {
                groupedData[label] = [];
            }
            
            // Para números de orden, verificar si ya existe antes de agregar
            if (label.toLowerCase().includes('número de orden') || 
                label.toLowerCase().includes('numero de orden') ||
                label.toLowerCase().includes('order number')) {
                // Solo agregar si no existe ya
                if (!groupedData[label].includes(value)) {
                    groupedData[label].push(value);
                }
            } else {
                // Para otras categorías (incluyendo ID de carga), agregar normalmente
                groupedData[label].push(value);
            }
        });
    }
    
    // Crear tabla horizontal con columnas separadas
    const allData = [];
    
    // Crear registros basados en la estructura de datos extraídos
    const records = [];
    const loadId = groupedData['ID de carga']?.[0] || '';
    
    if (structuredData && structuredData.length > 0) {
        // Método 2: Procesar secuencialmente manteniendo cada código de artículo como registro separado
        if (structuredData && structuredData.length > 0) {
            console.log('🔄 Usando método secuencial para mantener cada código de artículo...');
            console.log('📊 Datos estructurados recibidos de Gemini:');
            structuredData.forEach((item, index) => {
                console.log(`${index + 1}. ${item.label || item.nombre}: "${item.value || item.valor}"`);
            });
            
            let currentOrder = '';
            let currentArticleCode = '';
            let currentQuantities = [];
            
            for (let i = 0; i < structuredData.length; i++) {
                const item = structuredData[i];
                const label = item.label || item.nombre || '';
                const value = item.value || item.valor || '';
                
                if (label.toLowerCase().includes('número de orden') || label.toLowerCase().includes('numero de orden')) {
                    // Si tenemos datos acumulados del artículo anterior, crear registro
                    if (currentOrder && currentArticleCode) {
                        if (currentQuantities.length > 0) {
                            // Usar la primera cantidad (no sumar)
                            records.push({
                                loadId: loadId,
                                orderNumber: currentOrder,
                                articleName: currentArticleCode,
                                quantity: currentQuantities[0].replace(/\s+UND.*/, '')
                            });
                            console.log(`📝 Registro creado: ${currentOrder} | ${currentArticleCode} | ${currentQuantities[0]}`);
                        } else {
                            records.push({
                                loadId: loadId,
                                orderNumber: currentOrder,
                                articleName: currentArticleCode,
                                quantity: ''
                            });
                        }
                    }
                    
                    // Iniciar nuevo registro
                    currentOrder = value;
                    currentArticleCode = '';
                    currentQuantities = [];
                    
                } else if (label.toLowerCase().includes('código de artículo') || label.toLowerCase().includes('codigo de articulo')) {
                    // Si tenemos datos acumulados del artículo anterior, crear registro
                    if (currentOrder && currentArticleCode) {
                        if (currentQuantities.length > 0) {
                            // Usar la primera cantidad (no sumar)
                            records.push({
                                loadId: loadId,
                                orderNumber: currentOrder,
                                articleName: currentArticleCode,
                                quantity: currentQuantities[0].replace(/\s+UND.*/, '')
                            });
                            console.log(`📝 Registro creado: ${currentOrder} | ${currentArticleCode} | ${currentQuantities[0]}`);
                        } else {
                            records.push({
                                loadId: loadId,
                                orderNumber: currentOrder,
                                articleName: currentArticleCode,
                                quantity: ''
                            });
                        }
                    }
                    
                    currentArticleCode = value;
                    currentQuantities = [];
                    
                } else if (label.toLowerCase().includes('cantidad')) {
                    currentQuantities.push(value);
                }
            }
            
            // Procesar el último registro
            if (currentOrder && currentArticleCode) {
                if (currentQuantities.length > 0) {
                    // Usar la primera cantidad (no sumar)
                    records.push({
                        loadId: loadId,
                        orderNumber: currentOrder,
                        articleName: currentArticleCode,
                        quantity: currentQuantities[0].replace(/\s+UND.*/, '')
                    });
                    console.log(`📝 Último registro creado: ${currentOrder} | ${currentArticleCode} | ${currentQuantities[0]}`);
                } else {
                    records.push({
                        loadId: loadId,
                        orderNumber: currentOrder,
                        articleName: currentArticleCode,
                        quantity: ''
                    });
                }
            }
        }
    }

    console.log('📊 Registros agrupados:', records.length, 'registros creados');

    // Crear encabezados
    const headers = ['ID de carga', 'Número de orden', 'Código de artículo', 'Cantidad'];
    allData.push(headers);
    
    // Crear filas de datos
    if (records.length > 0) {
        records.forEach(record => {
            const row = [
                record.loadId,
                record.orderNumber,
                record.articleName,
                record.quantity
            ];
            allData.push(row);
        });
    } else {
        // Si no hay registros, agregar una fila vacía
        allData.push(['', '', '', '']);
    }
    
    console.log('📊 Tabla final:', allData.length, 'filas generadas');

    const mainWorksheet = XLSX.utils.aoa_to_sheet(allData);
    
    // Aplicar estilos básicos con anchos fijos para las 4 columnas
    mainWorksheet['!cols'] = [
        { width: 20 },  // ID de carga
        { width: 25 },  // Número de orden
        { width: 20 },  // Código de artículo
        { width: 15 }   // Cantidad
    ];
    
    XLSX.utils.book_append_sheet(workbook, mainWorksheet, 'Datos Extraídos');
    
    // Hoja de resumen
    const summaryData = [
        ['RESUMEN DE EXTRACCIÓN'],
        [''],
        ['Categoría', 'Cantidad'],
        ...Object.keys(groupedData).map(category => [
            category, 
            groupedData[category].length
        ])
    ];
    
    const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Resumen');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// Función principal para Vercel - VERSIÓN DE PRUEBA
module.exports = async (req, res) => {
    console.log('🚀 API iniciada - Método:', req.method, 'URL:', req.url);
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Manejar preflight
    if (req.method === 'OPTIONS') {
        console.log('✅ Preflight request manejado');
        res.status(200).end();
        return;
    }

    // Verificar método
    if (req.method !== 'POST') {
        console.log('❌ Método no permitido:', req.method);
        return res.status(405).json({
            success: false,
            error: 'Método no permitido'
        });
    }

    try {
        console.log('📥 Iniciando procesamiento de archivo...');
        
        // Procesar archivo con multer
        upload.single('file')(req, res, async (err) => {
            if (err) {
                console.error('❌ Error multer:', err);
                return res.status(400).json({
                    success: false,
                    error: 'Error procesando archivo: ' + err.message
                });
            }

            try {
                console.log('📋 Body recibido:', Object.keys(req.body || {}));
                console.log('📁 File recibido:', req.file ? 'SÍ' : 'NO');
                
                if (!req.file) {
                    console.log('❌ No se subió archivo');
                    return res.status(400).json({
                        success: false,
                        error: 'No se subió archivo'
                    });
                }

                console.log('📁 Archivo recibido:', req.file.originalname, req.file.size, 'bytes', req.file.mimetype);

                // Verificar que el archivo tenga contenido
                if (req.file.size === 0) {
                    console.log('❌ Archivo vacío');
                    return res.status(400).json({
                        success: false,
                        error: 'El archivo está vacío'
                    });
                }

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
                            error: 'Error procesando PDF: ' + pdfError.message
                        });
                    }
                } else {
                    extractedText = req.file.buffer.toString('utf8');
                    console.log('✅ Texto extraído:', extractedText.length, 'caracteres');
                }

                // Verificar que se extrajo texto
                if (!extractedText || extractedText.length === 0) {
                    console.log('❌ No se pudo extraer texto');
                    return res.status(500).json({
                        success: false,
                        error: 'No se pudo extraer texto del archivo'
                    });
                }

                // Campos solicitados
                const fields = req.body.fields ? JSON.parse(req.body.fields) : [];
                const requestedFields = fields.length > 0 ? fields : ['Número de orden', 'ID de carga', 'Código de artículo', 'Cantidad'];
                console.log('📋 Campos solicitados:', requestedFields);

                // Extraer datos
                const extractedData = await extractWithAI(extractedText, requestedFields);
                console.log('📊 Datos extraídos:', extractedData.length, 'campos');
                
                if (extractedData.length === 0) {
                    console.log('❌ No se pudieron extraer datos');
                    return res.status(500).json({
                        success: false,
                        error: 'No se pudieron extraer datos del archivo'
                    });
                }

                // Formatear datos
                const structuredData = extractedData.map(item => ({
                    label: item.nombre,
                    value: item.valor
                }));

                // Generar Excel
                const excelBuffer = generateExcel(structuredData);
                console.log('✅ Excel generado:', excelBuffer.length, 'bytes');

                // Enviar respuesta
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename="datos_extraidos.xlsx"');
                res.send(excelBuffer);
                console.log('✅ Respuesta enviada exitosamente');

            } catch (error) {
                console.error('❌ Error interno:', error);
                res.status(500).json({
                    success: false,
                    error: 'Error interno del servidor: ' + error.message
                });
            }
        });

    } catch (error) {
        console.error('❌ Error general:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor: ' + error.message
        });
    }
};
