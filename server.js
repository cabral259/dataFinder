const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ExtractorDatos = require('./index');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType } = require('docx');

const app = express();
const PORT = process.env.PORT || 3000;

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
    
    // Hoja de texto completo
    if (fullText) {
        const fullTextArray = [
            ['TEXTO COMPLETO EXTRAÍDO'],
            [''],
            ['Contenido:'],
            [fullText]
        ];
        
        const fullTextWorksheet = XLSX.utils.aoa_to_sheet(fullTextArray);
        XLSX.utils.book_append_sheet(workbook, fullTextWorksheet, 'Texto Completo');
    }
    
    // Hoja de información
    const infoArray = [
        ['INFORMACIÓN DEL PROCESAMIENTO'],
        [''],
        ['Archivo Original', fileName],
        ['Fecha de Procesamiento', new Date().toLocaleString()],
        ['Total de Elementos Encontrados', structuredData ? structuredData.length : 0],
        ['Categorías Encontradas', Object.keys(groupedData).length],
        ['Longitud del Texto', fullText ? fullText.length : 0]
    ];
    
    const infoWorksheet = XLSX.utils.aoa_to_sheet(infoArray);
    XLSX.utils.book_append_sheet(workbook, infoWorksheet, 'Información');
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
    console.log(`📊 API disponible en http://localhost:${PORT}/api/extract`);
    console.log(`📈 Estadísticas en http://localhost:${PORT}/api/stats`);
});

module.exports = app; 