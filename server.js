require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ExtractorDatos = require('./index');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType } = require('docx');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Google Gemini
console.log('🔑 Verificando API key de Gemini...');
console.log('🔑 API Key configurada:', process.env.GEMINI_API_KEY ? 'SÍ' : 'NO');
console.log('🔑 API Key (primeros 10 chars):', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'NO CONFIGURADA');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'demo-key');



// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['.pdf', '.xlsx', '.xls', '.docx', '.doc'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de archivo no soportado: ${ext}`));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB máximo
    }
});

// Instancia del extractor
const extractor = new ExtractorDatos();

// Función de extracción inteligente con Gemini
async function extractWithAI(text, requestedFields) {
    try {
        console.log('🤖 Iniciando extracción con Gemini Flash...');
        console.log('📋 Campos solicitados:', requestedFields);
        console.log('📄 Texto recibido (primeros 1000 chars):', text.substring(0, 1000));
        console.log('📄 Longitud del texto:', text.length);
        
        // Si el texto está vacío, devolver error
        if (!text || text.length === 0) {
            console.log('❌ Error: No se pudo extraer texto del documento');
            return [];
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
        
        // Usar Gemini Flash para extracción inteligente
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        
        const prompt = `
        Extrae EXACTAMENTE los siguientes campos del documento:
        ${requestedFields.join(', ')}
        
        Documento:
        ${text.substring(0, 30000)} // Usar más texto para mejor precisión
        
        Responde SOLO con un JSON válido en este formato:
        {
            "campos": [
                {"nombre": "nombre_del_campo", "valor": "valor_extraido"},
                {"nombre": "nombre_del_campo", "valor": "valor_extraido"}
            ]
        }
        
        Reglas importantes:
        1. Extrae SOLO los campos solicitados
        2. Si no encuentras un campo, no lo incluyas
        3. Mantén el formato exacto del valor encontrado
        4. Si hay múltiples valores del mismo campo, incluye todos
        5. Responde SOLO con el JSON, sin texto adicional
        `;
        
        console.log('🤖 Enviando prompt a Gemini...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponse = response.text();
        
        console.log('🤖 Respuesta de Gemini:', aiResponse);
        
        // Limpiar la respuesta de Gemini (remover markdown si existe)
        let cleanResponse = aiResponse;
        if (aiResponse.includes('```json')) {
            cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        }
        
        // Intentar parsear la respuesta JSON
        try {
            const parsedData = JSON.parse(cleanResponse);
            if (parsedData.campos && Array.isArray(parsedData.campos)) {
                console.log(`✅ Gemini extrajo ${parsedData.campos.length} campos`);
                return parsedData.campos;
            } else {
                console.log('⚠️ Respuesta de Gemini no tiene el formato esperado');
                return [];
            }
        } catch (parseError) {
            console.log('⚠️ Error parseando JSON de Gemini:', parseError.message);
            console.log('📄 Respuesta recibida:', aiResponse);
            console.log('📄 Respuesta limpia:', cleanResponse);
            return [];
        }
        
    } catch (error) {
        console.error('❌ Error en extracción con Gemini:', error);
        console.log('🔄 Usando extracción manual como fallback...');
        return extractFieldsManually(text, requestedFields);
    }
}

// Función de extracción manual como fallback
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
            
            orderPatterns.forEach(pattern => {
                const matches = text.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        results.push({ nombre: field, valor: match.trim() });
                        console.log(`✅ Encontrado orden: ${match.trim()}`);
                    });
                }
            });
        }
        
        if (fieldLower.includes('carga') || fieldLower.includes('load')) {
            // Buscar IDs de carga
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
    });
    
    console.log(`📊 Total de campos encontrados manualmente: ${results.length}`);
    return results;
}





// Rutas de la API

// GET - Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST - Extraer datos de archivos subidos
app.post('/api/extract', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No se subieron archivos'
            });
        }

        const filePaths = req.files.map(file => file.path);
        const extractionType = req.body.extractionType || 'all';
        const specificFields = req.body.specificFields ? JSON.parse(req.body.specificFields) : [];
        
        const results = await extractor.extractFromMultipleFiles(filePaths, {
            extractionType,
            specificFields
        });
        const stats = extractor.getExtractionStats(results);

        // Limpiar archivos subidos después de procesarlos
        filePaths.forEach(filePath => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });

        res.json({
            success: true,
            results: results,
            stats: stats
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST - Extracción inteligente con IA
app.post('/api/extract-ai', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No se subieron archivos'
            });
        }

        const filePaths = req.files.map(file => file.path);
        const requestedFields = req.body.fields ? JSON.parse(req.body.fields) : [];
        
        if (requestedFields.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No se especificaron campos para extraer'
            });
        }

        console.log('🤖 Iniciando extracción con IA para campos:', requestedFields);
        
        // Extraer texto del primer archivo
        const extractor = new ExtractorDatos();
        const textResult = await extractor.extractFromMultipleFiles(filePaths, {
            extractionType: 'all'
        });
        
        if (!textResult || textResult.length === 0) {
            return res.status(500).json({
                success: false,
                error: 'No se pudo extraer texto del documento'
            });
        }
        
        // Obtener el texto del resultado
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
        
        console.log('📄 Texto extraído (primeros 500 chars):', fullText.substring(0, 500));
        console.log('📄 Longitud total del texto:', fullText.length);
        
        // Validar que se extrajo texto
        if (!fullText || fullText.trim().length === 0) {
            return res.status(500).json({
                success: false,
                error: 'No se pudo extraer texto del documento. El archivo puede estar protegido, ser una imagen, o tener formato no estándar.'
            });
        }
        
        // Extraer campos con IA
        const extractedFields = await extractWithAI(fullText, requestedFields);
        
        // Limpiar archivos subidos
        filePaths.forEach(filePath => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });
        
        // Formatear resultados
        const structuredData = extractedFields.map(field => ({
            label: field.nombre,
            value: field.valor
        }));
        
        res.json({
            success: true,
            results: [{
                fileName: req.files[0].originalname,
                structuredData: structuredData,
                fullText: fullText.substring(0, 1000) // Limitar para respuesta
            }],
            stats: {
                totalFiles: 1,
                totalFields: extractedFields.length,
                extractionMethod: 'AI'
            }
        });

    } catch (error) {
        console.error('❌ Error en extracción con IA:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST - Exportar resultados a diferentes formatos
app.post('/api/export', async (req, res) => {
    try {
        const { fileName, format, structuredData, fullText } = req.body;
        
        if (!fileName || !format || !structuredData) {
            return res.status(400).json({
                success: false,
                error: 'Datos incompletos para la exportación'
            });
        }

        let buffer;
        const baseFileName = fileName.replace(/\.[^/.]+$/, '');

        switch (format) {
            case 'pdf':
                buffer = await generatePDF(baseFileName, structuredData, fullText);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${baseFileName}_resultados.pdf"`);
                break;
                
            case 'word':
                buffer = await generateWord(baseFileName, structuredData, fullText);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', `attachment; filename="${baseFileName}_resultados.docx"`);
                break;
                
            case 'excel':
                buffer = await generateExcel(baseFileName, structuredData, fullText);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="${baseFileName}_resultados.xlsx"`);
                break;
                
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Formato no soportado'
                });
        }

        res.send(buffer);

    } catch (error) {
        console.error('Error en exportación:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET - Obtener estadísticas del servidor
app.get('/api/stats', (req, res) => {
    res.json({
        server: 'Extractor de Datos API',
        version: '1.0.0',
        supportedFormats: ['.pdf', '.xlsx', '.xls', '.docx', '.doc'],
        uptime: process.uptime()
    });
});

// GET - Probar con archivo específico
app.get('/api/test/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join('./ejemplos', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'Archivo no encontrado'
            });
        }

        const result = await extractor.extractFromFile(filePath);
        res.json({
            success: true,
            result: result
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Manejo de errores
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'Archivo demasiado grande (máximo 10MB)'
            });
        }
    }
    
    res.status(500).json({
        success: false,
        error: error.message
    });
});

// Funciones para generar archivos de exportación

// Generar PDF
async function generatePDF(fileName, structuredData, fullText) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument();
            const chunks = [];
            
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            
            // Título simple
            doc.fontSize(16).text('Números de Orden Extraídos', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Archivo: ${fileName}`, { align: 'center' });
            doc.moveDown(2);
            
            // Agrupar datos por categoría
            const groupedData = {};
            if (structuredData && structuredData.length > 0) {
                structuredData.forEach(item => {
                    if (!groupedData[item.label]) {
                        groupedData[item.label] = [];
                    }
                    groupedData[item.label].push(item.value);
                });
            }

            // Crear tabla para cada categoría
            Object.keys(groupedData).forEach(category => {
                const values = groupedData[category];
                
                // Nueva página para cada categoría
                if (doc.y > doc.page.height - 100) {
                    doc.addPage();
                }
                
                // Título de la categoría
                doc.fontSize(12).text(`${category}:`, { underline: true });
                doc.moveDown();
                
                // Listar los valores
                values.forEach((value, index) => {
                    // Nueva página si es necesario
                    if (doc.y > doc.page.height - 100) {
                        doc.addPage();
                    }
                    
                    doc.fontSize(10).text(`${index + 1}. ${value}`, {
                        continued: false,
                        indent: 20
                    });
                });
                
                doc.moveDown(2);
            });
            
            // No mostrar resumen ni texto completo cuando solo se pidieron campos específicos
            if (structuredData && structuredData.length > 0) {
                // El texto completo y resumen se omiten intencionalmente
                doc.end();
                return;
            }
            
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

// Generar Word
async function generateWord(fileName, structuredData, fullText) {
    // Agrupar datos por categoría
    const groupedData = {};
    if (structuredData && structuredData.length > 0) {
        structuredData.forEach(item => {
            if (!groupedData[item.label]) {
                groupedData[item.label] = [];
            }
            groupedData[item.label].push(item.value);
        });
    }
    
    const children = [
        new Paragraph({
            text: 'Resultados de Extracción de Datos',
            heading: 'Heading1',
            alignment: AlignmentType.CENTER
        }),
        new Paragraph({
            text: `Archivo: ${fileName}`,
            alignment: AlignmentType.CENTER
        }),
        new Paragraph({
            text: `Fecha: ${new Date().toLocaleString()}`,
            alignment: AlignmentType.CENTER
        }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: '' })
    ];
    
    // Agregar secciones por categoría
    Object.keys(groupedData).forEach(category => {
        const categoryData = groupedData[category];
        
        children.push(
            new Paragraph({
                text: `${category} (${categoryData.length} elementos):`,
                heading: 'Heading2'
            }),
            new Paragraph({ text: '' })
        );
        
        // Tabla para cada categoría
        const tableRows = [
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({ text: '#', bold: true })],
                        width: { size: 15, type: WidthType.PERCENTAGE }
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: 'Valor', bold: true })],
                        width: { size: 85, type: WidthType.PERCENTAGE }
                    })
                ]
            })
        ];
        
        categoryData.forEach((value, index) => {
            tableRows.push(
                new TableRow({
                    children: [
                        new TableCell({
                            children: [new Paragraph({ text: (index + 1).toString() })]
                        }),
                        new TableCell({
                            children: [new Paragraph({ text: value })]
                        })
                    ]
                })
            );
        });
        
        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: tableRows
            }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: '' })
        );
    });
    
    const doc = new Document({
        sections: [{
            properties: {},
            children: children
        }]
    });
    
    return await Packer.toBuffer(doc);
}

// Generar Excel
async function generateExcel(fileName, structuredData, fullText) {
    const workbook = XLSX.utils.book_new();
    
    // Agrupar datos por categoría
    const groupedData = {};
    if (structuredData && structuredData.length > 0) {
        structuredData.forEach(item => {
            if (!groupedData[item.label]) {
                groupedData[item.label] = [];
            }
            groupedData[item.label].push(item.value);
        });
    }
    
    // Crear hojas separadas para cada categoría
    Object.keys(groupedData).forEach(category => {
        const categoryData = groupedData[category];
        const worksheetData = [
            [`${category} - Total: ${categoryData.length}`],
            [''],
            ['#', 'Valor'],
            ...categoryData.map((value, index) => [index + 1, value])
        ];
        
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        
        // Aplicar estilos básicos
        worksheet['!cols'] = [
            { width: 10 }, // Columna #
            { width: 30 }  // Columna Valor
        ];
        
        XLSX.utils.book_append_sheet(workbook, worksheet, category.substring(0, 31)); // Excel limita nombres de hoja a 31 caracteres
    });
    
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

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
    console.log(`📊 API disponible en http://localhost:${PORT}/api/extract`);
    console.log(`📈 Estadísticas en http://localhost:${PORT}/api/stats`);
});

module.exports = app; 